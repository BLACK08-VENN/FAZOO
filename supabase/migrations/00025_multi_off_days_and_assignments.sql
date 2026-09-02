-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo 00025 — multiple weekly off-days + multiple active assignments
--
--   • weekly_off_day becomes an array (smallint[]) on both assignment types so
--     a BA can rest several days per week (0=Sun … 6=Sat).
--   • A BA may hold MORE THAN ONE active assignment (e.g. several retail
--     campaigns, or several school visits). The "one active per BA" partial
--     unique indexes are dropped.
--   • Attendance is recorded per assignment (per campaign/store, or per school):
--       - ba_today() returns the list of the BA's active assignments for today,
--         each with its own off-day, log, sales and totals.
--       - ba_checkin() / ba_mark_sick_leave() / ba_checkout() target a specific
--         assignment (p_assignment_id) / daily log (p_daily_log_id).
--       - ba_submit_leave_request() links to a specific assignment.
--       - admin_upsert_assignment() / admin_create_ba() / create_brand()
--         accept an array of off-days and no longer force a single active row.
--
-- Signed URLs, storage and RLS are untouched. Every mutation still runs through
-- SECURITY DEFINER RPCs that derive identity, dates and distances server-side.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Column type changes: weekly_off_day smallint → smallint[]
-- ─────────────────────────────────────────────────────────────────────────────

-- Retail assignments: values must each be 0-6.
alter table public.brand_ambassador_assignments
  drop constraint if exists brand_ambassador_assignments_weekly_off_day_check,
  alter column weekly_off_day type smallint[] using array[weekly_off_day];
alter table public.brand_ambassador_assignments
  alter column weekly_off_day set not null,
  alter column weekly_off_day set default '{}'::smallint[],
  add constraint brand_ambassador_assignments_weekly_off_days_check
    check (weekly_off_day <@ ARRAY[0,1,2,3,4,5,6]::smallint[]);

-- Veda (school) assignments: values must each be 0-6, column stays nullable.
alter table public.veda_assignments
  drop constraint if exists veda_assignments_weekly_off_day_check,
  alter column weekly_off_day type smallint[] using array[weekly_off_day];
alter table public.veda_assignments
  add constraint veda_assignments_weekly_off_days_check
    check (weekly_off_day is null or weekly_off_day <@ ARRAY[0,1,2,3,4,5,6]::smallint[]);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Drop the "one active assignment per BA" constraints
-- ─────────────────────────────────────────────────────────────────────────────
drop index if exists public.assignments_one_active_idx;
drop index if exists public.veda_assignments_one_active_idx;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Helper: validated, deduplicated off-day array
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.normalize_off_days(p_days smallint[])
returns smallint[]
language plpgsql immutable set search_path = public as $$
declare
  v_out smallint[] := '{}'::smallint[];
  d smallint;
begin
  if p_days is null then
    return '{}'::smallint[];
  end if;
  foreach d in array p_days loop
    if d between 0 and 6 and not (d = any(v_out)) then
      v_out := v_out || d;
    end if;
  end loop;
  return v_out;
end;
$$;

grant execute on function public.normalize_off_days(smallint[]) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Retail core: ba_today returns ALL active assignments for today
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.ba_today();
create function public.ba_today()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p           public.profiles;
  lagos_d     date;
  dow         int;
  a           record;      -- each active assignment
  l           public.daily_logs%rowtype;
  sales       jsonb;
  total       int;
  radius      int;
  items       jsonb := '[]'::jsonb;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p.role <> 'brand_ambassador' then
    raise exception 'Only brand ambassadors can perform this action';
  end if;

  lagos_d := (now() at time zone 'Africa/Lagos')::date;
  dow     := extract(dow from lagos_d)::int;

  -- Aggregate every active assignment (with log/sales per assignment).
  for a in
    select ass.*, c.name as campaign_name, s.name as store_name,
           s.address as store_address, s.latitude as store_latitude,
           s.longitude as store_longitude, s.geofence_radius_metres
    from public.brand_ambassador_assignments ass
    join public.campaigns c on c.id = ass.campaign_id
    join public.stores s    on s.id = ass.store_id
    where ass.brand_ambassador_id = p.id
      and ass.organization_id = p.organization_id
      and ass.status = 'active'
      and ass.start_date <= lagos_d
      and (ass.end_date is null or ass.end_date >= lagos_d)
    order by ass.start_date desc, ass.created_at desc
  loop
    l := null;
    sales := '[]'::jsonb;
    total := 0;
    radius := a.geofence_radius_metres;

    select * into l from public.daily_logs
      where brand_ambassador_id = p.id
        and campaign_id = a.campaign_id
        and attendance_date = lagos_d
        and status <> 'cancelled'
      order by created_at desc limit 1;

    if l.id is not null then
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', e.id, 'sku_id', e.sku_id, 'sku_name', k.name,
               'sku_code', k.code, 'quantity', e.quantity, 'recorded_at', e.recorded_at))
               filter (where e.id is not null), '[]'::jsonb),
             coalesce(sum(e.quantity) filter (where e.id is not null), 0)
        into sales, total
      from public.sales_entries e
      left join public.skus k on k.id = e.sku_id
      where e.daily_log_id = l.id;
    end if;

    items := items
      || jsonb_build_object(
           'assignment', jsonb_build_object(
              'id', a.id,
              'campaign_id', a.campaign_id, 'campaign_name', a.campaign_name,
              'store_id', a.store_id, 'store_name', a.store_name,
              'store_address', a.store_address,
              'store_latitude', a.store_latitude, 'store_longitude', a.store_longitude,
              'geofence_radius_metres', radius),
           'weekly_off_day', a.weekly_off_day,
           'is_weekly_off_today', coalesce(dow = ANY(a.weekly_off_day), false),
           'log', case when l.id is null then null else to_jsonb(l) - 'client_request_id' end,
           'sales', sales,
           'total_units_today', total,
           'attendance_status', l.attendance_status,
           'log_status', l.status);
  end loop;

  return jsonb_build_object(
    'attendance_date', lagos_d,
    'assignments', items
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4b) Retail: sales target a specific daily log (multi-assignment disambiguation)
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.ba_record_sale(uuid, integer, uuid, timestamp with time zone);
drop function if exists public.ba_record_sale(uuid, integer, uuid, timestamp with time zone, uuid);
drop function if exists public.ba_update_sale(uuid, integer);
drop function if exists public.ba_update_sale(uuid, integer, uuid);
drop function if exists public.ba_delete_sale(uuid);
drop function if exists public.ba_delete_sale(uuid, uuid);

create function public.ba_record_sale(
  p_sku_id            uuid,
  p_quantity          integer,
  p_client_request_id uuid,
  p_recorded_at_hint  timestamptz default null,
  p_daily_log_id      uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p     public.profiles;
  l     public.daily_logs%rowtype;
  k     record;
  entry public.sales_entries%rowtype;
  prior jsonb;
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception 'Quantity must be at least 1.';
  end if;
  if p_quantity > 100000 then
    raise exception 'That quantity looks wrong.';
  end if;

  p := public.assert_active_ba();

  prior := public.try_consume_receipt(p_client_request_id, 'sale', p);
  if prior is not null and prior->>'sales_entry_id' is not null then
    return prior;
  end if;
  if prior is not null and prior->>'status' = 'pending' then
    delete from public.operation_receipts where client_request_id = p_client_request_id;
  elsif prior is not null then
    return prior;
  end if;

  select * into l from public.daily_logs
   where id = (
     select id from public.daily_logs
      where brand_ambassador_id = p.id and status = 'open'
        and (p_daily_log_id is null or id = p_daily_log_id)
      order by attendance_date desc, created_at desc limit 1
   );

  if l.id is null then
    raise exception 'Check in before recording sales.';
  end if;
  if l.attendance_status <> 'present' then
    raise exception 'Sales cannot be recorded today.';
  end if;
  if p_daily_log_id is not null and l.id is distinct from p_daily_log_id then
    raise exception 'That sale does not match an open check-in today.';
  end if;

  select * into k from public.skus
   where id = p_sku_id and organization_id = p.organization_id
     and campaign_id = l.campaign_id and status = 'active';
  if k.id is null then
    raise exception 'That SKU is not available on your current campaign.';
  end if;

  insert into public.sales_entries
    (organization_id, daily_log_id, sku_id, quantity, recorded_at, client_request_id)
  values
    (p.organization_id, l.id, p_sku_id, p_quantity,
     coalesce(p_recorded_at_hint, now()), p_client_request_id)
  returning * into entry;

  perform public.write_audit('sales.record', 'sales_entries', entry.id,
    jsonb_build_object('sku_id', p_sku_id, 'quantity', p_quantity));

  prior := jsonb_build_object('status','ok','operation','sale',
    'sales_entry_id', entry.id, 'quantity', p_quantity);
  perform public.complete_receipt(p_client_request_id, prior);
  return prior;
end;
$$;

create function public.ba_update_sale(p_sales_entry_id uuid, p_quantity integer, p_daily_log_id uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
declare p public.profiles; l record;
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception 'Quantity must be at least 1.';
  end if;
  p := public.assert_active_ba();

  select d.* into l from public.daily_logs d
   join public.sales_entries e on e.daily_log_id = d.id
   where e.id = p_sales_entry_id and e.organization_id = p.organization_id
     and d.brand_ambassador_id = p.id
     and (p_daily_log_id is null or d.id = p_daily_log_id);

  if l.id is null then raise exception 'Sale not found.'; end if;
  if l.status <> 'open' then raise exception 'This day is locked — ask an admin to reopen it.'; end if;

  update public.sales_entries set quantity = p_quantity
   where id = p_sales_entry_id;

  perform public.write_audit('sales.update', 'sales_entries', p_sales_entry_id,
    jsonb_build_object('quantity', p_quantity));
end;
$$;

create function public.ba_delete_sale(p_sales_entry_id uuid, p_daily_log_id uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
declare p public.profiles; l record;
begin
  p := public.assert_active_ba();

  select d.* into l from public.daily_logs d
   join public.sales_entries e on e.daily_log_id = d.id
   where e.id = p_sales_entry_id and e.organization_id = p.organization_id
     and d.brand_ambassador_id = p.id
     and (p_daily_log_id is null or d.id = p_daily_log_id);

  if l.id is null then raise exception 'Sale not found.'; end if;
  if l.status <> 'open' then raise exception 'This day is locked — ask an admin to reopen it.'; end if;

  delete from public.sales_entries where id = p_sales_entry_id;
  perform public.write_audit('sales.delete', 'sales_entries', p_sales_entry_id, null);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Retail: ba_checkin targets a specific assignment
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.ba_checkin(double precision, double precision, text, text, uuid, double precision, text);
create function public.ba_checkin(
  p_latitude            double precision,
  p_longitude           double precision,
  p_stock_photo_path    text,
  p_uniform_selfie_path text,
  p_client_request_id   uuid,
  p_assignment_id       uuid,
  p_accuracy_metres     double precision default null,
  p_notes               text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p       public.profiles;
  lagos_d date;
  dow     int;
  a       record;
  dist    double precision;
  radius  int;
  prior   jsonb;
  log_id  uuid;
begin
  p := public.assert_active_ba();

  prior := public.try_consume_receipt(p_client_request_id, 'checkin', p);
  if prior is not null and prior->>'daily_log_id' is not null then
    return prior;
  end if;
  if prior is not null and prior->>'status' = 'pending' then
    delete from public.operation_receipts where client_request_id = p_client_request_id;
  elsif prior is not null then
    return prior;
  end if;

  lagos_d := (now() at time zone 'Africa/Lagos')::date;
  dow     := extract(dow from lagos_d)::int;

  select ass.*, c.name as campaign_name, s.name as store_name,
         s.latitude as store_latitude, s.longitude as store_longitude,
         s.geofence_radius_metres
    into a
  from public.brand_ambassador_assignments ass
  join public.campaigns c on c.id = ass.campaign_id
  join public.stores s    on s.id = ass.store_id
  where ass.id = p_assignment_id
    and ass.brand_ambassador_id = p.id
    and ass.organization_id = p.organization_id
    and ass.status = 'active'
    and ass.start_date <= lagos_d
    and (ass.end_date is null or ass.end_date >= lagos_d);

  if a.id is null then
    raise exception 'You have no active assignment. Please contact your supervisor.';
  end if;

  if dow = ANY(a.weekly_off_day) then
    raise exception 'Today is your weekly off day';
  end if;

  perform 1 from public.daily_logs
   where brand_ambassador_id = p.id and campaign_id = a.campaign_id
     and attendance_date = lagos_d and status <> 'cancelled'
   limit 1;
  if found then
    raise exception 'You have already checked in for this campaign today.';
  end if;

  if not (p_stock_photo_path like p.organization_id::text || '/' || p.id::text || '/%')
     or not (p_uniform_selfie_path like p.organization_id::text || '/' || p.id::text || '/%') then
    raise exception 'Photo upload paths are invalid';
  end if;

  dist   := public.distance_metres(p_latitude, p_longitude, a.store_latitude, a.store_longitude);
  radius := a.geofence_radius_metres;
  if dist > radius then
    raise exception 'You are % m from % — check-in requires % m or less.',
      round(dist)::int, a.store_name, radius;
  end if;

  insert into public.daily_logs (
    organization_id, campaign_id, brand_ambassador_id, store_id,
    attendance_date, attendance_status,
    checkin_at, checkin_latitude, checkin_longitude, checkin_distance_metres,
    notes, status, client_request_id
  ) values (
    p.organization_id, a.campaign_id, p.id, a.store_id,
    lagos_d, 'present',
    now(), p_latitude, p_longitude, round(dist::numeric, 1),
    nullif(p_notes, ''), 'open', p_client_request_id
  ) returning id into log_id;

  insert into public.daily_log_photos (organization_id, daily_log_id, photo_type, storage_path, captured_at)
  values (p.organization_id, log_id, 'stock_shelf', p_stock_photo_path, now()),
         (p.organization_id, log_id, 'uniform_selfie', p_uniform_selfie_path, now());

  perform public.write_audit('daily_log.checkin', 'daily_logs', log_id,
    jsonb_build_object('assignment_id', p_assignment_id,
                       'distance_metres', round(dist::numeric,1), 'accuracy_metres', p_accuracy_metres));

  prior := jsonb_build_object('status','ok','operation','checkin',
    'daily_log_id', log_id, 'attendance_date', lagos_d, 'store_name', a.store_name,
    'campaign_id', a.campaign_id);
  perform public.complete_receipt(p_client_request_id, prior);
  return prior;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) Retail: ba_mark_sick_leave targets a specific assignment
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.ba_mark_sick_leave(text, uuid);
create function public.ba_mark_sick_leave(
  p_note              text default null,
  p_client_request_id uuid default null,
  p_assignment_id     uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p       public.profiles;
  lagos_d date;
  dow     int;
  a       record;
  log_id  uuid;
  prior   jsonb;
  v_rc    uuid := p_client_request_id;
begin
  p := public.assert_active_ba();
  if v_rc is null then
    v_rc := gen_random_uuid();
  end if;

  prior := public.try_consume_receipt(v_rc, 'sick_leave', p);
  if prior is not null and prior->>'status' = 'ok' then
    return prior;
  end if;
  if prior is not null and prior->>'status' = 'pending' then
    delete from public.operation_receipts where client_request_id = v_rc;
  elsif prior is not null then
    return prior;
  end if;

  lagos_d := (now() at time zone 'Africa/Lagos')::date;
  dow     := extract(dow from lagos_d)::int;

  select ass.* into a from public.brand_ambassador_assignments ass
   where ass.id = p_assignment_id
     and brand_ambassador_id = p.id and status = 'active'
     and organization_id = p.organization_id
     and start_date <= lagos_d and (end_date is null or end_date >= lagos_d);

  if a.id is null then
    raise exception 'You have no active assignment.';
  end if;
  if dow = ANY(a.weekly_off_day) then
    raise exception 'Today is already your weekly off day.';
  end if;

  perform 1 from public.daily_logs
   where brand_ambassador_id = p.id and campaign_id = a.campaign_id
     and attendance_date = lagos_d and status <> 'cancelled';
  if found then
    raise exception 'Attendance already recorded for this campaign today.';
  end if;

  insert into public.daily_logs (
    organization_id, campaign_id, brand_ambassador_id, store_id,
    attendance_date, attendance_status, notes, status
  ) values (
    p.organization_id, a.campaign_id, p.id, a.store_id,
    lagos_d, 'sick_leave', nullif(p_note, ''), 'completed'
  ) returning id into log_id;

  perform public.write_audit('attendance.sick_leave', 'daily_logs', log_id,
    jsonb_build_object('assignment_id', p_assignment_id, 'has_note', (p_note is not null)));

  prior := jsonb_build_object('status','ok','operation','sick_leave',
    'daily_log_id', log_id, 'attendance_date', lagos_d, 'campaign_id', a.campaign_id);
  perform public.complete_receipt(v_rc, prior);
  return prior;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) Retail: ba_checkout targets a specific daily log
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.ba_checkout(double precision, double precision, uuid, text, text, double precision, text);
create function public.ba_checkout(
  p_latitude            double precision,
  p_longitude           double precision,
  p_client_request_id   uuid,
  p_daily_log_id        uuid default null,
  p_stock_photo_path    text default null,
  p_uniform_selfie_path text default null,
  p_accuracy_metres     double precision default null,
  p_checkout_photo_path text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p       public.profiles;
  lagos_d date;
  l       public.daily_logs%rowtype;
  s       record;
  org     record;
  dist    double precision;
  outside boolean;
  prior   jsonb;
begin
  p := public.assert_active_ba();

  prior := public.try_consume_receipt(p_client_request_id, 'checkout', p);
  if prior is not null and prior->>'status' = 'ok' then
    return prior;
  end if;
  if prior is not null and prior->>'status' = 'pending' then
    delete from public.operation_receipts where client_request_id = p_client_request_id;
  elsif prior is not null then
    return prior;
  end if;

  lagos_d := (now() at time zone 'Africa/Lagos')::date;

  select * into l from public.daily_logs
   where brand_ambassador_id = p.id
     and attendance_date = lagos_d
     and status = 'open'
     and (p_daily_log_id is null or id = p_daily_log_id)
   order by created_at desc limit 1;

  if l.id is null then
    raise exception 'No open day to check out from.';
  end if;

  if p_stock_photo_path is not null
     and not (p_stock_photo_path like p.organization_id::text || '/' || p.id::text || '/%') then
    raise exception 'Photo upload paths are invalid';
  end if;
  if p_uniform_selfie_path is not null
     and not (p_uniform_selfie_path like p.organization_id::text || '/' || p.id::text || '/%') then
    raise exception 'Photo upload paths are invalid';
  end if;
  if p_checkout_photo_path is not null
     and not (p_checkout_photo_path like p.organization_id::text || '/' || p.id::text || '/%') then
    raise exception 'Checkout photo path is invalid';
  end if;

  select * into s from public.stores where id = l.store_id;
  select settings->>'allow_out_of_geofence_checkout' as allow_flag into org
    from public.organizations where id = p.organization_id;

  dist    := public.distance_metres(p_latitude, p_longitude, s.latitude, s.longitude);
  outside := dist > s.geofence_radius_metres;

  if outside and coalesce(org.allow_flag, 'false') <> 'true' then
    raise exception 'You are % m from % — checkout requires % m or less.',
      round(dist)::int, s.name, s.geofence_radius_metres;
  end if;

  update public.daily_logs set
    checkout_at            = now(),
    checkout_latitude      = p_latitude,
    checkout_longitude     = p_longitude,
    checkout_distance_metres = round(dist::numeric, 1),
    flagged                = outside,
    status                 = 'completed'
  where id = l.id;

  if p_stock_photo_path is not null and p_uniform_selfie_path is not null then
    insert into public.daily_log_photos (organization_id, daily_log_id, photo_type, storage_path, captured_at)
    values (p.organization_id, l.id, 'checkout_stock_shelf', p_stock_photo_path, now()),
           (p.organization_id, l.id, 'checkout_uniform_selfie', p_uniform_selfie_path, now())
    on conflict do nothing;
  end if;

  if p_checkout_photo_path is not null then
    insert into public.daily_log_photos (organization_id, daily_log_id, photo_type, storage_path, captured_at)
    values (p.organization_id, l.id, 'checkout', p_checkout_photo_path, now())
    on conflict do nothing;
  end if;

  perform public.write_audit(
    case when outside then 'daily_log.checkout_flagged' else 'daily_log.checkout' end,
    'daily_logs', l.id,
    jsonb_build_object('daily_log_id', l.id, 'distance_metres', round(dist::numeric,1),
                       'outside_geofence', outside, 'accuracy_metres', p_accuracy_metres));

  prior := jsonb_build_object('status','ok','operation','checkout',
    'daily_log_id', l.id, 'flagged', outside, 'campaign_id', l.campaign_id);
  perform public.complete_receipt(p_client_request_id, prior);
  return prior;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) leave request: submit targets a specific assignment
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.ba_submit_leave_request(public.leave_type, date, date, date, boolean, text, text, text[], boolean, uuid);
create function public.ba_submit_leave_request(
  p_assignment_id                  uuid,
  p_leave_type                     public.leave_type,
  p_start_date                     date,
  p_end_date                       date,
  p_expected_return_date           date,
  p_supervisor_informed            boolean,
  p_supervisor_not_informed_reason text,
  p_reason                         text,
  p_supporting_document_types      text[],
  p_policy_acknowledged            boolean,
  p_client_request_id              uuid
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p          public.profiles;
  a          public.brand_ambassador_assignments;
  request_id uuid;
  prior      jsonb;
  lagos_d    date := (now() at time zone 'Africa/Lagos')::date;
begin
  p := public.assert_active_ba();

  if p_client_request_id is null then
    raise exception 'A client request id is required.';
  end if;

  prior := public.try_consume_receipt(p_client_request_id, 'submit_leave_request', p);
  if prior is not null and prior->>'status' = 'ok' then return prior; end if;
  if prior is not null and prior->>'status' = 'pending' then
    delete from public.operation_receipts where client_request_id = p_client_request_id;
    prior := public.try_consume_receipt(p_client_request_id, 'submit_leave_request', p);
  elsif prior is not null then
    return prior;
  end if;

  if p_start_date < lagos_d then raise exception 'Leave cannot start in the past.'; end if;
  if p_end_date < p_start_date then raise exception 'End date must be on or after start date.'; end if;
  if p_expected_return_date <= p_end_date then
    raise exception 'Expected return date must be after the leave ends.';
  end if;
  if p_end_date - p_start_date > 365 then raise exception 'Leave period is too long.'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 5 and 2000 then
    raise exception 'Reason must be between 5 and 2000 characters.';
  end if;
  if not p_supervisor_informed and
     char_length(btrim(coalesce(p_supervisor_not_informed_reason, ''))) not between 5 and 500 then
    raise exception 'Explain why your supervisor has not been informed.';
  end if;
  if not coalesce(p_policy_acknowledged, false) then
    raise exception 'Leave policy acknowledgement is required.';
  end if;

  select * into a
  from public.brand_ambassador_assignments
  where id = p_assignment_id
    and brand_ambassador_id = p.id
    and organization_id = p.organization_id
    and status = 'active'
    and start_date <= p_start_date
    and (end_date is null or end_date >= p_start_date);

  if a.id is null then raise exception 'You have no active assignment for the leave start date.'; end if;

  if exists (
    select 1 from public.leave_requests lr
    where lr.brand_ambassador_id = p.id
      and lr.assignment_id = p_assignment_id
      and lr.status in ('pending', 'approved')
      and daterange(lr.start_date, lr.end_date, '[]') && daterange(p_start_date, p_end_date, '[]')
  ) then
    raise exception 'A pending or approved request already overlaps these dates for this assignment.';
  end if;

  insert into public.leave_requests (
    organization_id, brand_ambassador_id, store_id, assignment_id,
    leave_type, start_date, end_date, expected_return_date,
    supervisor_informed, supervisor_not_informed_reason, reason,
    supporting_document_types, policy_acknowledged_at, client_request_id
  ) values (
    p.organization_id, p.id, a.store_id, a.id,
    p_leave_type, p_start_date, p_end_date, p_expected_return_date,
    p_supervisor_informed,
    case when p_supervisor_informed then null else nullif(btrim(p_supervisor_not_informed_reason), '') end,
    btrim(p_reason),
    coalesce(p_supporting_document_types, '{}'), now(), p_client_request_id
  ) returning id into request_id;

  perform public.write_audit(
    'leave_request.submit', 'leave_requests', request_id,
    jsonb_build_object(
      'leave_type', p_leave_type,
      'start_date', p_start_date,
      'end_date', p_end_date,
      'store_id', a.store_id,
      'assignment_id', p_assignment_id
    )
  );

  prior := jsonb_build_object(
    'status', 'ok',
    'operation', 'submit_leave_request',
    'leave_request_id', request_id
  );
  perform public.complete_receipt(p_client_request_id, prior);
  return prior;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9) Admin upsert assignment: array off-days, no forced single-active
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.admin_upsert_assignment(uuid, uuid, uuid, smallint, date, date, assignment_status, uuid);
create function public.admin_upsert_assignment(
  p_brand_ambassador_id uuid,
  p_campaign_id        uuid,
  p_store_id           uuid,
  p_weekly_off_day     smallint[],
  p_start_date         date,
  p_end_date           date default null,
  p_status             assignment_status default 'active',
  p_assignment_id      uuid default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare actor public.profiles; ba record; camp record; st record; v_id uuid;
  off smallint[];
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.role not in ('super_admin','organization_admin') or actor.account_status <> 'approved' then
    raise exception 'Not permitted';
  end if;

  select * into ba from public.profiles
   where id = p_brand_ambassador_id and role = 'brand_ambassador';
  if actor.role = 'organization_admin' then
    if ba.id is null or ba.organization_id <> actor.organization_id then
      raise exception 'Brand ambassador not in your organization';
    end if;
  elsif ba.id is null then
    raise exception 'Brand ambassador not found';
  end if;

  select * into camp from public.campaigns
   where id = p_campaign_id and status = 'active'
     and (actor.role = 'super_admin' or organization_id = actor.organization_id);
  if camp.id is null then raise exception 'Campaign not found or inactive'; end if;

  select * into st from public.stores
   where id = p_store_id and status = 'active'
     and (actor.role = 'super_admin' or organization_id = actor.organization_id);
  if st.id is null then raise exception 'Store not found or inactive'; end if;

  off := public.normalize_off_days(p_weekly_off_day);

  if p_assignment_id is null then
    -- Multiple concurrent active assignments are allowed; just create a new one.
    insert into public.brand_ambassador_assignments
      (organization_id, brand_ambassador_id, campaign_id, store_id,
       weekly_off_day, start_date, end_date, status)
    values
      (ba.organization_id, p_brand_ambassador_id, p_campaign_id, p_store_id,
       off, p_start_date, p_end_date, p_status)
    returning id into v_id;

    perform public.write_audit('assignment.create', 'brand_ambassador_assignments', v_id,
      jsonb_build_object('ba', p_brand_ambassador_id, 'campaign', p_campaign_id,
                         'store', p_store_id, 'weekly_off_day', off));
  else
    update public.brand_ambassador_assignments set
      campaign_id = p_campaign_id, store_id = p_store_id,
      weekly_off_day = off, start_date = p_start_date,
      end_date = p_end_date, status = p_status
     where id = p_assignment_id
       and (actor.role = 'super_admin' or organization_id = actor.organization_id)
    returning id into v_id;

    if v_id is not null then
      perform public.write_audit('assignment.update', 'brand_ambassador_assignments', v_id, null);
    end if;
  end if;

  if v_id is null then raise exception 'Assignment not found'; end if;
  return v_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10) Admin create BA: no campaign/store; array off-days; no forced assignment
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.admin_create_ba(uuid, uuid, uuid, smallint, date, date);
create function public.admin_create_ba(
  p_user_id        uuid,
  p_weekly_off_day smallint[],
  p_start_date     date,
  p_end_date       date default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  actor  public.profiles;
  target public.profiles;
  off    smallint[];
  mem_id uuid;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.id is null or actor.account_status <> 'approved'
     or actor.role not in ('super_admin', 'organization_admin') then
    raise exception 'Not permitted.';
  end if;

  select * into target from public.profiles where id = p_user_id;
  if target.id is null then raise exception 'BA account not found.'; end if;
  if target.role not in ('brand_ambassador') then
    raise exception 'Only brand ambassadors can be provisioned here.';
  end if;

  off := public.normalize_off_days(p_weekly_off_day);
  if p_start_date is null then raise exception 'Start date is required.'; end if;
  if p_end_date is not null and p_end_date < p_start_date then
    raise exception 'End date must be on or after start date.';
  end if;

  -- Provision the membership (trusted sync re-points the temp profile to the
  -- admin's org, role brand_ambassador, status approved — bypasses the guard).
  insert into public.organization_memberships
    (user_id, organization_id, role, account_status, code_granted_at)
  values
    (p_user_id, actor.organization_id, 'brand_ambassador', 'approved', now())
  on conflict (user_id, organization_id)
  do update set role = 'brand_ambassador', account_status = 'approved', code_granted_at = now()
  returning id into mem_id;

  -- No assignment is created here: the BA becomes assignable by an admin to
  -- one or more campaigns/stores later (see admin_upsert_assignment).

  perform public.write_audit(
    'profile.create_ba', 'profiles', p_user_id,
    jsonb_build_object(
      'membership_id', mem_id,
      'weekly_off_day', off,
      'start_date', p_start_date,
      'end_date', p_end_date
    )
  );

  return jsonb_build_object(
    'status', 'ok',
    'profile_id', p_user_id,
    'membership_id', mem_id
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11) create_brand: array off-days for the initial assignment
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.create_brand(text, text, uuid, text, date, text, text, date, text, text, double precision, double precision, int, uuid[], smallint);
create or replace function public.create_brand(
  p_name text,
  p_slug text,
  p_brand_admin_user_id uuid,
  p_campaign_name text,
  p_campaign_start date,
  p_timezone text default 'Africa/Lagos',
  p_access_code text default null,
  p_campaign_end date default null,
  p_store_name text default null,
  p_store_address text default null,
  p_store_lat double precision default null,
  p_store_lng double precision default null,
  p_store_radius int default 200,
  p_ba_user_ids uuid[] default '{}',
  p_weekly_off_day smallint[] default '{0}'
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller public.profiles;
  v_org_id uuid;
  v_campaign_id uuid;
  v_store_id uuid;
  v_gate boolean;
  v_code text;
  v_name text;
  ba uuid;
  off smallint[];
  v_added_bas integer := 0;
  v_assigned integer := 0;
begin
  select * into caller from public.profiles where id = auth.uid();
  if caller.id is null or caller.account_status <> 'approved'
     or caller.role <> 'super_admin' then
    raise exception 'Not permitted';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'Brand name is required';
  end if;
  if nullif(trim(p_slug), '') is null then
    raise exception 'Brand slug is required';
  end if;
  if p_slug !~ '^[a-z0-9-]{2,60}$' then
    raise exception 'Brand slug must be 2-60 lowercase letters, digits or dashes';
  end if;
  if exists (select 1 from public.organizations where slug = lower(trim(p_slug))) then
    raise exception 'That brand slug is already in use';
  end if;
  if p_brand_admin_user_id is null then
    raise exception 'A brand admin account is required';
  end if;
  if not exists (select 1 from auth.users where id = p_brand_admin_user_id) then
    raise exception 'Brand admin account does not exist';
  end if;

  v_gate := p_access_code is not null and nullif(trim(p_access_code), '') is not null;
  v_code := case when v_gate then trim(p_access_code) else null end;

  insert into public.organizations
    (name, slug, timezone, has_code_gate, access_code, status)
  values
    (trim(p_name), lower(trim(p_slug)), coalesce(nullif(trim(p_timezone), ''), 'Africa/Lagos'),
     v_gate, v_code, 'active')
  returning id into v_org_id;

  v_name := coalesce(nullif(trim(p_campaign_name), ''), 'Brand Launch');
  insert into public.campaigns
    (organization_id, name, description, start_date, end_date, status)
  values
    (v_org_id, v_name,
     'Initial campaign for ' || trim(p_name),
     coalesce(p_campaign_start, current_date),
     p_campaign_end, 'active')
  returning id into v_campaign_id;

  insert into public.organization_memberships
    (user_id, organization_id, role, account_status, access_code_used, code_granted_at)
  values
    (p_brand_admin_user_id, v_org_id, 'organization_admin', 'approved', v_code,
     case when v_gate then now() else null end);

  if nullif(trim(p_store_name), '') is not null then
    if p_store_lat is null or p_store_lng is null then
      raise exception 'Store coordinates are required';
    end if;
    insert into public.stores
      (organization_id, name, address, latitude, longitude, geofence_radius_metres, status)
    values
      (v_org_id, trim(p_store_name),
       nullif(trim(coalesce(p_store_address, '')), ''),
       p_store_lat, p_store_lng,
       coalesce(p_store_radius, 200)::int, 'active')
    returning id into v_store_id;
  end if;

  off := public.normalize_off_days(p_weekly_off_day);

  foreach ba in array (select coalesce(p_ba_user_ids, '{}'::uuid[])) loop
    if not exists (
      select 1 from public.organization_memberships m
      where m.user_id = ba
        and m.role = 'brand_ambassador'
        and m.account_status = 'approved'
    ) then
      continue;
    end if;

    insert into public.organization_memberships
      (user_id, organization_id, role, account_status, access_code_used, code_granted_at)
    values
      (ba, v_org_id, 'brand_ambassador', 'approved', v_code,
       case when v_gate then now() else null end);

    v_added_bas := v_added_bas + 1;

    if v_store_id is not null then
      insert into public.brand_ambassador_assignments
        (organization_id, brand_ambassador_id, campaign_id, store_id,
         weekly_off_day, start_date, end_date, status)
      values
        (v_org_id, ba, v_campaign_id, v_store_id,
         off, coalesce(p_campaign_start, current_date),
         p_campaign_end, 'active');
      v_assigned := v_assigned + 1;
    end if;
  end loop;

  perform public.write_audit(
    'organization.create', 'organizations', v_org_id,
    jsonb_build_object(
      'name', trim(p_name), 'slug', lower(trim(p_slug)),
      'has_code_gate', v_gate,
      'brand_admin_user_id', p_brand_admin_user_id,
      'campaign_id', v_campaign_id,
      'store_id', v_store_id,
      'bas_linked', v_added_bas,
      'assignments_created', v_assigned
    ),
    auth.uid(), v_org_id
  );

  return jsonb_build_object(
    'status', 'ok',
    'organization_id', v_org_id,
    'organization_slug', lower(trim(p_slug)),
    'campaign_id', v_campaign_id,
    'store_id', v_store_id,
    'brand_admin_user_id', p_brand_admin_user_id,
    'bas_linked', v_added_bas,
    'assignments_created', v_assigned,
    'access_code', v_code
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12) Veda: array off-days; veda_today returns all active school visits
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.veda_today();
create function public.veda_today()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p          public.profiles;
  nairobi_d  date;
  dow        int;
  a          record;
  s          public.veda_sessions%rowtype;
  dists      jsonb;
  item_rows  jsonb;
  items      jsonb := '[]'::jsonb;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p.role <> 'brand_ambassador' then
    raise exception 'Only brand ambassadors can perform this action';
  end if;

  nairobi_d := (now() at time zone 'Africa/Nairobi')::date;
  dow       := extract(dow from nairobi_d)::int;

  for a in
    select va.*, sch.name as school_name, sch.region as school_region,
           sch.latitude as school_latitude, sch.longitude as school_longitude,
           sch.geofence_radius_metres
    from public.veda_assignments va
    join public.veda_schools sch on sch.id = va.school_id
    where va.brand_ambassador_id = p.id
      and va.organization_id = p.organization_id
      and va.status = 'active'
      and va.start_date <= nairobi_d
      and (va.end_date is null or va.end_date >= nairobi_d)
    order by va.start_date desc, va.created_at desc
  loop
    s := null;
    dists := '[]'::jsonb;

    select * into s from public.veda_sessions
      where brand_ambassador_id = p.id
        and school_id = a.school_id
        and session_date = nairobi_d
        and status <> 'cancelled'
      order by created_at desc limit 1;

    if s.id is not null then
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', d.id, 'stationery_item_id', d.stationery_item_id,
               'item_name', it.name, 'item_code', it.code, 'quantity', d.quantity)
               order by it.name), '[]'::jsonb)
        into dists
      from public.veda_session_distributions d
      join public.veda_stationery_items it on it.id = d.stationery_item_id
      where d.session_id = s.id;
    end if;

    items := items
      || jsonb_build_object(
           'assignment', jsonb_build_object(
              'id', a.id, 'school_id', a.school_id, 'school_name', a.school_name,
              'school_region', a.school_region, 'school_latitude', a.school_latitude,
              'school_longitude', a.school_longitude, 'geofence_radius_metres', a.geofence_radius_metres),
           'weekly_off_day', a.weekly_off_day,
           'is_weekly_off_today', coalesce(a.weekly_off_day is not null and dow = ANY(a.weekly_off_day), false),
           'session', case when s.id is null then null else to_jsonb(s) - 'client_request_id' end,
           'distributions', dists,
           'session_status', s.status,
           'learner_count', s.learner_count);
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', it.id, 'name', it.name, 'code', it.code)
           order by it.name), '[]'::jsonb)
    into item_rows
  from public.veda_stationery_items it
  where it.organization_id = p.organization_id
    and it.status = 'active';

  return jsonb_build_object(
    'attendance_date', nairobi_d,
    'assignments', items,
    'stationery_items', item_rows
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13) Veda: check-in targets a specific school visit assignment
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.veda_checkin(double precision, double precision, text, text, uuid, double precision, integer, text);
create function public.veda_checkin(
  p_latitude               double precision,
  p_longitude              double precision,
  p_selfie_photo_path      text,
  p_stamped_document_path  text,
  p_client_request_id      uuid,
  p_assignment_id          uuid,
  p_accuracy_metres        double precision default null,
  p_learner_count          integer default 0,
  p_notes                  text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p          public.profiles;
  nairobi_d  date;
  dow        int;
  a          record;
  dist       double precision;
  radius     int;
  prior      jsonb;
  session_id uuid;
begin
  p := public.assert_active_ba();

  prior := public.try_consume_receipt(p_client_request_id, 'veda_checkin', p);
  if prior is not null and prior->>'session_id' is not null then
    return prior;
  end if;
  if prior is not null and prior->>'status' = 'pending' then
    delete from public.operation_receipts where client_request_id = p_client_request_id;
  elsif prior is not null then
    return prior;
  end if;

  nairobi_d := (now() at time zone 'Africa/Nairobi')::date;
  dow       := extract(dow from nairobi_d)::int;

  select va.*, sch.name as school_name, sch.latitude as school_latitude,
         sch.longitude as school_longitude, sch.geofence_radius_metres
    into a
  from public.veda_assignments va
  join public.veda_schools sch on sch.id = va.school_id
  where va.id = p_assignment_id
    and va.brand_ambassador_id = p.id
    and va.organization_id = p.organization_id
    and va.status = 'active'
    and va.start_date <= nairobi_d
    and (va.end_date is null or va.end_date >= nairobi_d);

  if a.id is null then
    raise exception 'You have no active school visit today. Please contact your supervisor.';
  end if;

  if a.weekly_off_day is not null and dow = ANY(a.weekly_off_day) then
    raise exception 'Today is your weekly off day';
  end if;

  perform 1 from public.veda_sessions
   where brand_ambassador_id = p.id and school_id = a.school_id
     and session_date = nairobi_d and status <> 'cancelled'
   limit 1;
  if found then
    raise exception 'You have already checked in for this school visit today.';
  end if;

  if not (p_selfie_photo_path like p.organization_id::text || '/' || p.id::text || '/%')
     or not (p_stamped_document_path like p.organization_id::text || '/' || p.id::text || '/%') then
    raise exception 'Photo upload paths are invalid';
  end if;

  dist   := public.distance_metres(p_latitude, p_longitude, a.school_latitude, a.school_longitude);
  radius := a.geofence_radius_metres;
  if dist > radius then
    raise exception 'You are % m from % — check-in requires % m or less.',
      round(dist)::int, a.school_name, radius;
  end if;

  insert into public.veda_sessions (
    organization_id, school_id, brand_ambassador_id, session_date,
    learner_count, status, checkin_at,
    checkin_latitude, checkin_longitude, checkin_distance_metres,
    notes, client_request_id
  ) values (
    p.organization_id, a.school_id, p.id, nairobi_d,
    greatest(0, coalesce(p_learner_count, 0)), 'open', now(),
    p_latitude, p_longitude, round(dist::numeric, 1),
    nullif(p_notes, ''), p_client_request_id
  ) returning id into session_id;

  insert into public.veda_session_photos
    (organization_id, session_id, photo_type, storage_path, captured_at)
  values
    (p.organization_id, session_id, 'site_selfie', p_selfie_photo_path, now()),
    (p.organization_id, session_id, 'stamped_document', p_stamped_document_path, now());

  perform public.write_audit('veda_session.checkin', 'veda_sessions', session_id,
    jsonb_build_object('school_id', a.school_id, 'assignment_id', p_assignment_id,
                       'distance_metres', round(dist::numeric,1), 'accuracy_metres', p_accuracy_metres));

  prior := jsonb_build_object('status','ok','operation','veda_checkin',
    'session_id', session_id, 'school_id', a.school_id, 'school_name', a.school_name);
  perform public.complete_receipt(p_client_request_id, prior);
  return prior;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 14) Veda: admin upsert assignment — array off-days, no forced single-active
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.veda_admin_upsert_assignment(uuid, uuid, smallint, date, date, assignment_status, uuid);
create function public.veda_admin_upsert_assignment(
  p_brand_ambassador_id uuid,
  p_school_id           uuid,
  p_weekly_off_day      smallint[] default null,
  p_start_date          date default null,
  p_end_date            date default null,
  p_status              assignment_status default 'active',
  p_assignment_id       uuid default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  actor public.profiles;
  ba    public.profiles;
  sch   record;
  off   smallint[];
  v_id  uuid;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.role not in ('super_admin','organization_admin') or actor.account_status <> 'approved' then
    raise exception 'Not permitted';
  end if;

  select * into ba from public.profiles
   where id = p_brand_ambassador_id and role = 'brand_ambassador';
  if actor.role = 'organization_admin' then
    if ba.id is null or ba.organization_id <> actor.organization_id then
      raise exception 'Brand ambassador not in your organization';
    end if;
  elsif ba.id is null then
    raise exception 'Brand ambassador not found';
  end if;

  select * into sch from public.veda_schools
   where id = p_school_id and status = 'active'
     and (actor.role = 'super_admin' or organization_id = actor.organization_id);
  if sch.id is null then raise exception 'School not found or inactive'; end if;

  off := public.normalize_off_days(p_weekly_off_day);
  if off = '{}'::smallint[] then off := null; end if;

  if p_assignment_id is null then
    insert into public.veda_assignments
      (organization_id, brand_ambassador_id, school_id, weekly_off_day, start_date, end_date, status)
    values
      (ba.organization_id, p_brand_ambassador_id, p_school_id, off,
       coalesce(p_start_date, current_date), p_end_date, p_status)
    returning id into v_id;

    perform public.write_audit('veda_assignment.create', 'veda_assignments', v_id,
      jsonb_build_object('ba', p_brand_ambassador_id, 'school', p_school_id,
                         'weekly_off_day', off));
  else
    update public.veda_assignments set
      school_id = p_school_id, weekly_off_day = off,
      start_date = coalesce(p_start_date, start_date),
      end_date = p_end_date, status = p_status
     where id = p_assignment_id
       and (actor.role = 'super_admin' or organization_id = actor.organization_id);

    v_id := p_assignment_id;
    perform public.write_audit('veda_assignment.update', 'veda_assignments', v_id, null);
  end if;

  return v_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 15) Grants (re-grant the changed signatures)
-- ─────────────────────────────────────────────────────────────────────────────
grant execute on function
  public.ba_today(),
  public.ba_checkin(double precision, double precision, text, text, uuid, uuid, double precision, text),
  public.ba_mark_sick_leave(text, uuid, uuid),
  public.ba_checkout(double precision, double precision, uuid, uuid, text, text, double precision, text),
  public.ba_submit_leave_request(uuid, public.leave_type, date, date, date, boolean, text, text, text[], boolean, uuid),
  public.ba_record_sale(uuid, integer, uuid, timestamp with time zone, uuid),
  public.ba_update_sale(uuid, integer, uuid),
  public.ba_delete_sale(uuid, uuid),
  public.admin_upsert_assignment(uuid, uuid, uuid, smallint[], date, date, assignment_status, uuid),
  public.admin_create_ba(uuid, smallint[], date, date),
  public.create_brand(text, text, uuid, text, date, text, text, date, text, text, double precision, double precision, int, uuid[], smallint[]),
  public.veda_today(),
  public.veda_checkin(double precision, double precision, text, text, uuid, uuid, double precision, integer, text),
  public.veda_admin_upsert_assignment(uuid, uuid, smallint[], date, date, assignment_status, uuid)
to authenticated;

commit;