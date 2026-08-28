-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo 00016 — checkout requires completion photos.
--
-- Replaces `ba_checkout` so that closing a daily log is impossible without a
-- fresh stock-on-shelf photograph and a uniform selfie. The unique index now
-- also covers the new checkout photo types to keep retries idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

-- The partial unique index currently protects only check-in photo types.
drop index if exists public.daily_log_photos_unique_type_idx;
create unique index daily_log_photos_unique_type_idx
  on public.daily_log_photos (daily_log_id, photo_type)
  where photo_type in ('stock_shelf','uniform_selfie','checkout_stock_shelf','checkout_uniform_selfie');

-- ── ba_checkout ──────────────────────────────────────────────────────────────
drop function if exists public.ba_checkout(double precision, double precision, uuid, double precision, text);
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

  -- Photos must live inside this BA's private folder.
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

  -- Record the completion photos taken for this checkout. Paths were
  -- validated above, and the partial unique index keeps retries idempotent.
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

-- New signature replaces the old one; grant EXECUTE to the authenticated role.
GRANT EXECUTE ON FUNCTION public.ba_checkout(double precision, double precision, uuid, text, text, double precision, text) TO authenticated;