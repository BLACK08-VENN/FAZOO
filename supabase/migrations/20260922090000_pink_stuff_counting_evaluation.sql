-- Pink Stuff evaluation is photoless for stock: the BA checks in with a single
-- geofenced uniform selfie (taken in the changing room) and then records
-- opening/closing STOCK COUNTS per SKU instead of a stock shelf photo.
-- This migration:
--   1. Puts the Pink Stuff campaign on the stock-count model so ba_today
--      surfaces the counting flow and ba_record_sale is disabled.
--   2. Reworks ba_checkin so that COUNTING campaigns accept a selfie-only
--      check-in (p_stock_photo_path optional); non-counting campaigns stay
--      mandatory on both photos as before.

begin;

-- ── 1. Pink Stuff → stock-count model ────────────────────────────────────────
update public.campaigns c
   set stock_count_model = true
  from public.organizations o
 where c.organization_id = o.id
   and o.slug = 'pink-stuff'
   and lower(c.name) = 'pink stuff';

-- ── 2. ba_checkin: selfie-only for counting campaigns ────────────────────────
drop function if exists public.ba_checkin(double precision, double precision, text, text, uuid, uuid, double precision, text);
create function public.ba_checkin(
  p_latitude            double precision,
  p_longitude           double precision,
  p_stock_photo_path    text default null,
  p_uniform_selfie_path text default null,
  p_client_request_id   uuid default null,
  p_assignment_id       uuid default null,
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
  v_counting boolean;
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

  select ass.*, c.name as campaign_name, c.stock_count_model as counting,
         s.name as store_name,
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

  v_counting := coalesce(a.counting, false);

  -- Non-counting campaigns keep the classic two-photo check-in. Counting
  -- campaigns (Pink Stuff) require only the geofenced uniform selfie; the
  -- stock is captured as per-SKU opening counts, not a shelf photo.
  if v_counting then
    if p_uniform_selfie_path is null
       or p_uniform_selfie_path not like p.organization_id::text || '/' || p.id::text || '/%' then
      raise exception 'A uniform selfie is required at check-in';
    end if;
    if p_stock_photo_path is not null
       and p_stock_photo_path not like p.organization_id::text || '/' || p.id::text || '/%' then
      raise exception 'Photo upload paths are invalid';
    end if;
  else
    if p_stock_photo_path is null or p_uniform_selfie_path is null
       or p_stock_photo_path not like p.organization_id::text || '/' || p.id::text || '/%'
       or p_uniform_selfie_path not like p.organization_id::text || '/' || p.id::text || '/%' then
      raise exception 'Photo upload paths are invalid';
    end if;
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

  if p_stock_photo_path is not null then
    insert into public.daily_log_photos (organization_id, daily_log_id, photo_type, storage_path, captured_at)
    values (p.organization_id, log_id, 'stock_shelf', p_stock_photo_path, now());
  end if;
  insert into public.daily_log_photos (organization_id, daily_log_id, photo_type, storage_path, captured_at)
  values (p.organization_id, log_id, 'uniform_selfie', p_uniform_selfie_path, now());

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

commit;