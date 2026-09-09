-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo — Allow store to be "not applicable" on BA campaign assignments
--
-- VEDA BAs are school/region-based, not store-based.  Admins should be able
-- to attach a BA to a campaign without forcing a retail store.  Making
-- `store_id` nullable allows that while keeping daily_logs.store_id NOT NULL
-- (retail check-ins still require a real store).
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. brand_ambassador_assignments.store_id becomes optional ───────────────
alter table public.brand_ambassador_assignments
  alter column store_id drop not null;

-- ── 2. admin_upsert_assignment: accept a null store ─────────────────────────
drop function if exists public.admin_upsert_assignment(uuid, uuid, uuid, smallint[], date, date, assignment_status, uuid);

create function public.admin_upsert_assignment(
  p_brand_ambassador_id uuid,
  p_campaign_id        uuid,
  p_store_id           uuid default null,
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

  if p_store_id is not null then
    select * into st from public.stores
     where id = p_store_id and status = 'active'
       and (actor.role = 'super_admin' or organization_id = actor.organization_id);
    if st.id is null then raise exception 'Store not found or inactive'; end if;
  end if;

  off := public.normalize_off_days(p_weekly_off_day);

  if p_assignment_id is null then
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

-- ── 3. ba_today(): LEFT JOIN stores so null-store assignments still surface ──
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

  for a in
    select ass.*, c.name as campaign_name, s.name as store_name,
           s.address as store_address, s.latitude as store_latitude,
           s.longitude as store_longitude, s.geofence_radius_metres
    from public.brand_ambassador_assignments ass
    join public.campaigns c on c.id = ass.campaign_id
    left join public.stores s on s.id = ass.store_id
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

-- ── 4. ba_checkin(): guard against null-store assignments ────────────────────
drop function if exists public.ba_checkin(double precision, double precision, text, text, uuid, uuid, double precision, text);
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
  left join public.stores s on s.id = ass.store_id
  where ass.id = p_assignment_id
    and ass.brand_ambassador_id = p.id
    and ass.organization_id = p.organization_id
    and ass.status = 'active'
    and ass.start_date <= lagos_d
    and (ass.end_date is null or ass.end_date >= lagos_d);

  if a.id is null then
    raise exception 'You have no active assignment. Please contact your supervisor.';
  end if;

  if a.store_id is null then
    raise exception 'This assignment has no store — use the school check-in app.';
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

-- ── 5. ba_mark_sick_leave(): guard against null-store assignments ────────────
drop function if exists public.ba_mark_sick_leave(text, uuid, uuid);
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
  if a.store_id is null then
    raise exception 'This assignment has no store — attendance cannot be recorded.';
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

-- ── 6. Re-grant the changed signatures ───────────────────────────────────────
grant execute on function
  public.ba_today(),
  public.ba_checkin(double precision, double precision, text, text, uuid, uuid, double precision, text),
  public.ba_mark_sick_leave(text, uuid, uuid),
  public.admin_upsert_assignment(uuid, uuid, uuid, smallint[], date, date, assignment_status, uuid)
to authenticated;

commit;