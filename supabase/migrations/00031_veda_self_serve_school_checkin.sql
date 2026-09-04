-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo 00031 — VEDA self-serve school check-in by unlocked school.
--
-- Allows an approved BA to start a VEDA log from a chosen unlocked school even
-- when no pre-created assignment row exists. If an active assignment exists, it
-- is still honoured; otherwise the school unlock + org scope gate the action.
-- Evidence remains mandatory: site selfie + stamped document.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

drop function if exists public.veda_checkin(double precision, double precision, text, text, uuid, uuid, double precision, integer, text);

create function public.veda_checkin(
  p_latitude               double precision,
  p_longitude              double precision,
  p_selfie_photo_path      text,
  p_stamped_document_path  text,
  p_client_request_id      uuid,
  p_assignment_id          uuid default null,
  p_school_id              uuid default null,
  p_accuracy_metres        double precision default null,
  p_learner_count          integer default 0,
  p_notes                  text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p          public.profiles;
  prior      jsonb;
  nairobi_d  date;
  dow        int;
  a          record;
  dist       double precision;
  radius     int;
  session_id uuid;
begin
  p := public.assert_active_ba();

  if p_assignment_id is null and p_school_id is null then
    raise exception 'A school or assignment is required.';
  end if;

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

  if p_assignment_id is not null then
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

    if a.weekly_off_day is not null and dow = any(a.weekly_off_day) then
      raise exception 'Today is your weekly off day';
    end if;
  else
    select
      null::uuid as id,
      sch.id as school_id,
      sch.name as school_name,
      sch.latitude as school_latitude,
      sch.longitude as school_longitude,
      sch.geofence_radius_metres,
      null::smallint[] as weekly_off_day
    into a
    from public.veda_schools sch
    where sch.id = p_school_id
      and sch.organization_id = p.organization_id
      and sch.status = 'active'
      and exists (
        select 1
        from public.veda_school_unlocks u
        where u.school_id = sch.id and u.user_id = p.id
      );

    if a.school_id is null then
      raise exception 'This school is not unlocked for you. Ask your supervisor for access.';
    end if;
  end if;

  if not (p_selfie_photo_path like p.organization_id::text || '/' || p.id::text || '/%')
     or not (p_stamped_document_path like p.organization_id::text || '/' || p.id::text || '/%') then
    raise exception 'Photo upload paths are invalid';
  end if;

  perform 1 from public.veda_sessions
   where brand_ambassador_id = p.id and school_id = a.school_id
     and session_date = nairobi_d and status <> 'cancelled'
   limit 1;
  if found then
    raise exception 'You have already checked in for this school visit today.';
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

  perform public.write_audit(
    'veda_session.checkin',
    'veda_sessions',
    session_id,
    jsonb_build_object(
      'school_id', a.school_id,
      'assignment_id', p_assignment_id,
      'distance_metres', round(dist::numeric, 1),
      'accuracy_metres', p_accuracy_metres,
      'source', case when p_assignment_id is null then 'self_serve_unlocked_school' else 'assignment' end
    )
  );

  prior := jsonb_build_object(
    'status', 'ok',
    'operation', 'veda_checkin',
    'session_id', session_id,
    'school_id', a.school_id,
    'school_name', a.school_name
  );
  perform public.complete_receipt(p_client_request_id, prior);
  return prior;
end;
$$;

grant execute on function public.veda_checkin(double precision, double precision, text, text, uuid, uuid, uuid, double precision, integer, text)
  to authenticated;

commit;