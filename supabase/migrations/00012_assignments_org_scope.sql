-- Multi-brand: scope a BA's active assignment lookup to their currently
-- active organization, and allow one active assignment per (BA, brand)
-- instead of globally. A BA may be an approved member of several brands
-- (e.g. Lenovo + Veda) and each brand has its own campaign/store/geofence.

begin;

drop index if exists public.assignments_one_active_idx;
create unique index assignments_one_active_idx
  on public.brand_ambassador_assignments (brand_ambassador_id, organization_id)
  where status = 'active';

create or replace function public.ba_today()
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
    and ass.organization_id = p.organization_id
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
create or replace function public.ba_checkin(
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
    and ass.organization_id = p.organization_id
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
create or replace function public.ba_mark_sick_leave(
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
     and organization_id = p.organization_id
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

commit;
