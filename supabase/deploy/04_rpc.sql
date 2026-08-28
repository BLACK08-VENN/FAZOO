-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo 00004 — BA + admin RPCs (SECURITY DEFINER).
--
-- Invariants enforced here, server-side only:
--   • identity/organization/role/approval come from the JWT via profiles
--   • attendance date = (now() AT TIME ZONE 'Africa/Lagos')::date
--   • distances recomputed from store coordinates (haversine)
--   • weekly off-day read from the active assignment
--   • idempotency: every client operation carries a UUID receipt
--   • every action lands in audit_logs
-- ═══════════════════════════════════════════════════════════════════════════

-- Safety: drop RPC functions from prior partial runs
DROP FUNCTION IF EXISTS public.assert_active_ba() CASCADE;
DROP FUNCTION IF EXISTS public.try_consume_receipt(uuid, text, public.profiles) CASCADE;
DROP FUNCTION IF EXISTS public.complete_receipt(uuid, jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.ba_today() CASCADE;
DROP FUNCTION IF EXISTS public.ba_checkin(double precision, double precision, text, text, uuid, double precision, text) CASCADE;
DROP FUNCTION IF EXISTS public.ba_checkout(double precision, double precision, uuid, double precision, text) CASCADE;
DROP FUNCTION IF EXISTS public.ba_record_sale(uuid, integer, uuid, timestamptz) CASCADE;
DROP FUNCTION IF EXISTS public.ba_update_sale(uuid, integer) CASCADE;
DROP FUNCTION IF EXISTS public.ba_delete_sale(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.ba_mark_sick_leave(text, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.admin_set_account_status(uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.admin_upsert_assignment(uuid, uuid, uuid, smallint, date, date, public.assignment_status, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.admin_reopen_daily_log(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.check_rate_limit(text, int, int) CASCADE;

-- ── shared guards ───────────────────────────────────────────────────────────
create function public.assert_active_ba()
returns public.profiles
language plpgsql stable security definer set search_path = public as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p.role <> 'brand_ambassador' then
    raise exception 'Only brand ambassadors can perform this action';
  end if;
  if p.account_status <> 'approved' then
    raise exception 'Your account is not approved yet (%).', p.account_status;
  end if;
  if exists (select 1 from public.organizations o where o.id = p.organization_id and o.status <> 'active') then
    raise exception 'Your organization is not active';
  end if;
  return p;
end;
$$;

create function public.try_consume_receipt(
  p_client_request_id uuid,
  p_operation         text,
  p_ba                public.profiles
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare existing record;
begin
  select result into existing from public.operation_receipts
  where client_request_id = p_client_request_id limit 1;
  if found then
    return coalesce(existing.result, '{"duplicate": true}'::jsonb);
  end if;
  -- Reserve the slot early; final result is patched by the caller.
  insert into public.operation_receipts
    (organization_id, brand_ambassador_id, client_request_id, operation, result)
  values
    (p_ba.organization_id, p_ba.id, p_client_request_id, p_operation,
     jsonb_build_object('status', 'pending', 'operation', p_operation))
  on conflict (client_request_id) do nothing;

  select result into existing from public.operation_receipts
  where client_request_id = p_client_request_id limit 1;
  return null; -- caller proceeds with the operation
end;
$$;

create function public.complete_receipt(
  p_client_request_id uuid,
  p_result            jsonb
)
returns void language sql security definer set search_path = public as $$
  update public.operation_receipts set result = p_result
  where client_request_id = p_client_request_id;
$$;

-- ── ba_today: everything the dashboard needs in one call ────────────────────
create function public.ba_today()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p            public.profiles;
  lagos_d      date;
  dow          int;
  a            record;
  l            public.daily_logs%rowtype;
  sales        jsonb;
  total        int;
  radius       int;
  result       jsonb;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null then raise exception 'Not signed in'; end if;

  lagos_d := (now() at time zone 'Africa/Lagos')::date;
  -- extract(dow) is Sunday=0 … Saturday=6 → matches weekly_off_day convention
  dow := extract(dow from lagos_d)::int;

  select ass.*, c.name as campaign_name, s.name as store_name,
         s.address as store_address, s.latitude as store_latitude,
         s.longitude as store_longitude, s.geofence_radius_metres
    into a
  from public.brand_ambassador_assignments ass
  join public.campaigns c on c.id = ass.campaign_id
  join public.stores s    on s.id = ass.store_id
  where ass.brand_ambassador_id = p.id
    and ass.status = 'active'
    and ass.start_date <= lagos_d
    and (ass.end_date is null or ass.end_date >= lagos_d)
  order by ass.start_date desc
  limit 1;

  if a.id is not null then
    select * into l from public.daily_logs
    where brand_ambassador_id = p.id
      and campaign_id = a.campaign_id
      and attendance_date = lagos_d
      and status <> 'cancelled'
    order by created_at desc limit 1;

    radius := a.geofence_radius_metres;

    select coalesce(jsonb_agg(jsonb_build_object(
             'id', e.id, 'sku_id', e.sku_id, 'sku_name', k.name,
             'sku_code', k.code, 'quantity', e.quantity, 'recorded_at', e.recorded_at))
             filter (where e.id is not null), '[]'::jsonb),
           coalesce(sum(e.quantity) filter (where e.id is not null), 0)
      into sales, total
    from public.sales_entries e
    left join public.skus k on k.id = e.sku_id
    where l.id is not null and e.daily_log_id = l.id;
  else
    sales := '[]'::jsonb;
    total := 0;
  end if;

  result := jsonb_build_object(
    'attendance_date', lagos_d,
    'weekly_off_day',  a.weekly_off_day,
    'is_weekly_off_today', (a.weekly_off_day is not null and a.weekly_off_day = dow),
    'assignment', case when a.id is null then null else jsonb_build_object(
        'id', a.id,
        'campaign_id', a.campaign_id, 'campaign_name', a.campaign_name,
        'store_id', a.store_id, 'store_name', a.store_name,
        'store_address', a.store_address,
        'store_latitude', a.store_latitude, 'store_longitude', a.store_longitude,
        'geofence_radius_metres', radius) end,
    'log', case when l.id is null then null else to_jsonb(l) - 'client_request_id' end,
    'sales', case when l.id is null then '[]'::jsonb else sales end,
    'total_units_today', total,
    'attendance_status', l.attendance_status,
    'log_status', l.status
  );
  return result;
end;
$$;

-- ── ba_checkin ───────────────────────────────────────────────────────────────
create function public.ba_checkin(
  p_latitude            double precision,
  p_longitude           double precision,
  p_stock_photo_path    text,
  p_uniform_selfie_path text,
  p_client_request_id   uuid,
  p_accuracy_metres     double precision default null,
  p_notes               text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p          public.profiles;
  lagos_d    date;
  dow        int;
  a          record;
  dist       double precision;
  radius     int;
  prior      jsonb;
  log_id     uuid;
begin
  p := public.assert_active_ba();

  -- Idempotency first: replay stored outcome for retried requests.
  prior := public.try_consume_receipt(p_client_request_id, 'checkin', p);
  if prior is not null and prior->>'daily_log_id' is not null then
    return prior;
  end if;
  if prior is not null and prior->>'status' = 'pending' then
    -- A crashed attempt reserved the receipt without completing.
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
  where ass.brand_ambassador_id = p.id
    and ass.status = 'active'
    and ass.start_date <= lagos_d
    and (ass.end_date is null or ass.end_date >= lagos_d)
  order by ass.start_date desc limit 1;

  if a.id is null then
    raise exception 'You have no active assignment. Please contact your supervisor.';
  end if;

  if a.weekly_off_day = dow then
    raise exception 'Today is your weekly off day (%)',
      (array['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'])[a.weekly_off_day + 1];
  end if;

  -- Duplicate / conflicting attendance for today
  perform 1 from public.daily_logs
   where brand_ambassador_id = p.id and campaign_id = a.campaign_id
     and attendance_date = lagos_d and status <> 'cancelled'
   limit 1;
  if found then
    raise exception 'You have already checked in today.';
  end if;

  -- Photos must live inside this BA's private folder.
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
    jsonb_build_object('distance_metres', round(dist::numeric,1), 'accuracy_metres', p_accuracy_metres));

  prior := jsonb_build_object('status','ok','operation','checkin',
    'daily_log_id', log_id, 'attendance_date', lagos_d, 'store_name', a.store_name);
  perform public.complete_receipt(p_client_request_id, prior);
  return prior;
end;
$$;

-- ── ba_checkout ──────────────────────────────────────────────────────────────
create function public.ba_checkout(
  p_latitude            double precision,
  p_longitude           double precision,
  p_client_request_id   uuid,
  p_stock_photo_path    text,
  p_uniform_selfie_path text,
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
   order by created_at desc limit 1;

  if l.id is null then
    raise exception 'No open day to check out from.';
  end if;

  -- Completion photos must live inside this BA's private upload folder.
  if not (p_stock_photo_path like p.organization_id::text || '/' || p.id::text || '/%')
     or not (p_uniform_selfie_path like p.organization_id::text || '/' || p.id::text || '/%') then
    raise exception 'Photo upload paths are invalid';
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

  insert into public.daily_log_photos (organization_id, daily_log_id, photo_type, storage_path, captured_at)
  values (p.organization_id, l.id, 'checkout_stock_shelf', p_stock_photo_path, now()),
         (p.organization_id, l.id, 'checkout_uniform_selfie', p_uniform_selfie_path, now())
  on conflict do nothing;

  if p_checkout_photo_path is not null then
    if not (p_checkout_photo_path like p.organization_id::text || '/' || p.id::text || '/%') then
      raise exception 'Checkout photo path is invalid';
    end if;
    insert into public.daily_log_photos (organization_id, daily_log_id, photo_type, storage_path, captured_at)
    values (p.organization_id, l.id, 'checkout', p_checkout_photo_path, now())
    on conflict do nothing;
  end if;

  perform public.write_audit(
    case when outside then 'daily_log.checkout_flagged' else 'daily_log.checkout' end,
    'daily_logs', l.id,
    jsonb_build_object('distance_metres', round(dist::numeric,1),
                       'outside_geofence', outside, 'accuracy_metres', p_accuracy_metres));

  prior := jsonb_build_object('status','ok','operation','checkout',
    'daily_log_id', l.id, 'flagged', outside);
  perform public.complete_receipt(p_client_request_id, prior);
  return prior;
end;
$$;

-- ── sales ────────────────────────────────────────────────────────────────────
create function public.ba_record_sale(
  p_sku_id            uuid,
  p_quantity          integer,
  p_client_request_id uuid,
  p_recorded_at_hint  timestamptz default null  -- hint only; DB stamps truth
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
      order by attendance_date desc, created_at desc limit 1
   );

  if l.id is null then
    raise exception 'Check in before recording sales.';
  end if;
  if l.attendance_status <> 'present' then
    raise exception 'Sales cannot be recorded today.';
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

create function public.ba_update_sale(p_sales_entry_id uuid, p_quantity integer)
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
     and d.brand_ambassador_id = p.id;

  if l.id is null then raise exception 'Sale not found.'; end if;
  if l.status <> 'open' then raise exception 'This day is locked — ask an admin to reopen it.'; end if;

  update public.sales_entries set quantity = p_quantity
   where id = p_sales_entry_id;

  perform public.write_audit('sales.update', 'sales_entries', p_sales_entry_id,
    jsonb_build_object('quantity', p_quantity));
end;
$$;

create function public.ba_delete_sale(p_sales_entry_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare p public.profiles; l record;
begin
  p := public.assert_active_ba();

  select d.* into l from public.daily_logs d
   join public.sales_entries e on e.daily_log_id = d.id
   where e.id = p_sales_entry_id and e.organization_id = p.organization_id
     and d.brand_ambassador_id = p.id;

  if l.id is null then raise exception 'Sale not found.'; end if;
  if l.status <> 'open' then raise exception 'This day is locked — ask an admin to reopen it.'; end if;

  delete from public.sales_entries where id = p_sales_entry_id;
  perform public.write_audit('sales.delete', 'sales_entries', p_sales_entry_id, null);
end;
$$;

-- ── sick leave ───────────────────────────────────────────────────────────────
create function public.ba_mark_sick_leave(
  p_note              text default null,
  p_client_request_id uuid default null
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
    v_rc := gen_random_uuid();  -- direct calls still get a receipt
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

  select * into a from public.brand_ambassador_assignments
   where brand_ambassador_id = p.id and status = 'active'
     and start_date <= lagos_d and (end_date is null or end_date >= lagos_d)
   order by start_date desc limit 1;

  if a.id is null then
    raise exception 'You have no active assignment.';
  end if;
  if a.weekly_off_day = dow then
    raise exception 'Today is already your weekly off day.';
  end if;

  perform 1 from public.daily_logs
   where brand_ambassador_id = p.id and campaign_id = a.campaign_id
     and attendance_date = lagos_d and status <> 'cancelled';
  if found then
    raise exception 'Attendance already recorded for today.';
  end if;

  insert into public.daily_logs (
    organization_id, campaign_id, brand_ambassador_id, store_id,
    attendance_date, attendance_status, notes, status
  ) values (
    p.organization_id, a.campaign_id, p.id, a.store_id,
    lagos_d, 'sick_leave', nullif(p_note, ''), 'completed'
  ) returning id into log_id;

  perform public.write_audit('attendance.sick_leave', 'daily_logs', log_id,
    jsonb_build_object('has_note', (p_note is not null)));

  prior := jsonb_build_object('status','ok','operation','sick_leave',
    'daily_log_id', log_id, 'attendance_date', lagos_d);
  perform public.complete_receipt(v_rc, prior);
  return prior;
end;
$$;

-- ── admin operations ─────────────────────────────────────────────────────────
create function public.admin_set_account_status(
  p_profile_id uuid,
  p_action     text,
  p_reason     text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare actor public.profiles; target public.profiles; new_status account_status;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.role not in ('super_admin','organization_admin') or actor.account_status <> 'approved' then
    raise exception 'Not permitted';
  end if;

  select * into target from public.profiles where id = p_profile_id;
  if target.id is null then raise exception 'Profile not found'; end if;
  if actor.role = 'organization_admin' and target.organization_id <> actor.organization_id then
    raise exception 'Cross-organization access denied';
  end if;
  if target.role = 'super_admin' then
    raise exception 'Super administrators are managed by the platform only';
  end if;

  new_status := case p_action
    when 'approve'    then 'approved'::account_status
    when 'reject'     then 'rejected'::account_status
    when 'suspend'    then 'suspended'::account_status
    when 'reactivate' then 'approved'::account_status
    when 'deactivate' then 'inactive'::account_status
  end;

  if new_status is null then
    raise exception 'Unknown action %', p_action;
  end if;

  update public.profiles set account_status = new_status where id = p_profile_id;

  perform public.write_audit('profile.' || p_action, 'profiles', p_profile_id,
    jsonb_build_object('from', target.account_status, 'to', new_status, 'reason', p_reason));

  return jsonb_build_object('status','ok','profile_id', p_profile_id, 'account_status', new_status);
end;
$$;

create function public.admin_upsert_assignment(
  p_brand_ambassador_id uuid,
  p_campaign_id        uuid,
  p_store_id           uuid,
  p_weekly_off_day     smallint,
  p_start_date         date,
  p_end_date           date default null,
  p_status             assignment_status default 'active',
  p_assignment_id      uuid default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare actor public.profiles; ba record; camp record; st record; v_id uuid;
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

  if p_weekly_off_day not between 0 and 6 then
    raise exception 'Weekly off day must be 0–6';
  end if;

  if p_assignment_id is null then
    -- Close any active assignment first (one active per BA).
    update public.brand_ambassador_assignments
       set status = 'ended', end_date = least(p_start_date - 1, current_date)
     where brand_ambassador_id = p_brand_ambassador_id and status = 'active';

    insert into public.brand_ambassador_assignments
      (organization_id, brand_ambassador_id, campaign_id, store_id,
       weekly_off_day, start_date, end_date, status)
    values
      (ba.organization_id, p_brand_ambassador_id, p_campaign_id, p_store_id,
       p_weekly_off_day, p_start_date, p_end_date, p_status)
    returning id into v_id;

    perform public.write_audit('assignment.create', 'brand_ambassador_assignments', v_id,
      jsonb_build_object('ba', p_brand_ambassador_id, 'campaign', p_campaign_id,
                         'store', p_store_id, 'weekly_off_day', p_weekly_off_day));
  else
    update public.brand_ambassador_assignments set
      campaign_id = p_campaign_id, store_id = p_store_id,
      weekly_off_day = p_weekly_off_day, start_date = p_start_date,
      end_date = p_end_date, status = p_status
     where id = p_assignment_id
       and (actor.role = 'super_admin' or organization_id = actor.organization_id);

    v_id := p_assignment_id;
    perform public.write_audit('assignment.update', 'brand_ambassador_assignments', v_id, null);
  end if;

  return v_id;
end;
$$;

create function public.admin_reopen_daily_log(p_daily_log_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare actor public.profiles; l record;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.role not in ('super_admin','organization_admin') or actor.account_status <> 'approved' then
    raise exception 'Not permitted';
  end if;

  select * into l from public.daily_logs where id = p_daily_log_id;
  if l.id is null then raise exception 'Log not found'; end if;
  if actor.role = 'organization_admin' and l.organization_id <> actor.organization_id then
    raise exception 'Cross-organization access denied';
  end if;

  update public.daily_logs set status = 'open', reopened_by = actor.id
   where id = p_daily_log_id;

  perform public.write_audit('daily_log.reopen', 'daily_logs', p_daily_log_id, null);
end;
$$;

-- ── rate limiting ────────────────────────────────────────────────────────────
create function public.check_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean
language plpgsql security definer set search_path = public, private as $$
declare window_start timestamptz; hits int; now_ts timestamptz := now();
begin
  select window_start, hit_count into window_start, hits
    from private.rate_limits where key = p_key;

  if window_start is null or now_ts - window_start > make_interval(secs => p_window_seconds) then
    insert into private.rate_limits (key, window_start, hit_count)
    values (p_key, now_ts, 1)
    on conflict (key) do update set window_start = excluded.window_start,
                                    hit_count = 1;
    return true;
  end if;

  if hits >= p_max then
    return false;
  end if;

  update private.rate_limits set hit_count = hit_count + 1 where key = p_key;
  return true;
end;
$$;

-- ── grants ───────────────────────────────────────────────────────────────────
-- Postgres grants EXECUTE to PUBLIC by default; tighten every sensitive
-- helper so only the intended callers (definer internals / service role /
-- authenticated RPCs) can reach it.
do $$
declare f record;
begin
  for f in
    select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname in (
        'write_audit','assert_active_ba','try_consume_receipt','complete_receipt',
        'current_profile','is_super_admin','is_org_admin','can_read_org',
        'current_user_role_hint','account_status_active',
        'supervisor_can_see_store','supervisor_can_see_campaign',
        'audit_row_change','set_updated_at','guard_profile_update','handle_new_user'
      )
  loop
    execute format('revoke execute on function public.%s from public', f.sig);
    execute format('revoke execute on function public.%s from anon', f.sig);
  end loop;
end $$;

revoke execute on function public.check_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, int, int) to service_role;

grant execute on function
  public.ba_today(),
  public.ba_checkin(double precision, double precision, text, text, uuid, double precision, text),
  public.ba_checkout(double precision, double precision, uuid, text, text, double precision, text),
  public.ba_record_sale(uuid, integer, uuid, timestamptz),
  public.ba_update_sale(uuid, integer),
  public.ba_delete_sale(uuid),
  public.ba_mark_sick_leave(text, uuid)
to authenticated;

grant execute on function
  public.admin_set_account_status(uuid, text, text),
  public.admin_upsert_assignment(uuid, uuid, uuid, smallint, date, date, assignment_status, uuid),
  public.admin_reopen_daily_log(uuid)
to authenticated;
