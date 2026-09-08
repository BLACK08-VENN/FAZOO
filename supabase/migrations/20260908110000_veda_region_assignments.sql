-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo — VEDA region-based school assignments
--
-- Replace "BA ↔ one school" with "BA ↔ one or more regions". A BA is assigned
-- to a region (e.g. NAIROBI) and can check in at any active school in that
-- region. Multi-region per BA is supported by storing one row per region.
--
-- Changes:
--   veda_assignments.school_id            -> veda_assignments.region (text)
--   veda_today()                      now returns region cards, each with the
--                                     active schools in that region plus any
--                                     live session/distributions per school.
--   veda_checkin(...)                 now targets p_school_id; the server
--                                     verifies the school belongs to one of
--                                     the BA's active region assignments.
--                                     p_assignment_id is kept as an optional
--                                     hint for backward compatibility.
--   veda_admin_upsert_assignment(...) now takes p_region instead of p_school_id.
--   ba_list_veda_schools()            unchanged — lists all active schools;
--                                     the server enforces region membership
--                                     at check-in (never trust the client).
--   encoded_document_reminder         mobile copy, no DB change.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. veda_assignments: school_id  ->  region ──────────────────────────────
drop index if exists public.veda_assignments_school_idx;

alter table public.veda_assignments
  drop column if exists school_id,
  add column region text;

update public.veda_assignments
   set region = 'UNASSIGNED'
 where region is null;

alter table public.veda_assignments
  alter column region set not null;

-- No unique "one active per BA" index: multi-region means a BA can have several
-- active region rows. (The old single-active index was already removed.)

create index veda_assignments_region_idx
  on public.veda_assignments (organization_id, region, status);

-- ── 2. veda_today(): region cards with schools ──────────────────────────────
drop function if exists public.veda_today();

create function public.veda_today()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p          public.profiles;
  lagos_d    date;
  dow        int;
  a          record;
  s          public.veda_sessions%rowtype;
  sch        record;
  session_json jsonb;
  dists      jsonb;
  sch_rows   jsonb;
  region_schools jsonb;
  region_item jsonb;
  regions    jsonb := '[]'::jsonb;
  item_rows  jsonb;
  items      jsonb := '[]'::jsonb;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p.role <> 'brand_ambassador' then
    raise exception 'Only brand ambassadors can perform this action';
  end if;

  lagos_d := (now() at time zone 'Africa/Lagos')::date;
  dow     := extract(dow from lagos_d)::int;

  -- One card per active region assignment for this BA.
  for a in
    select va.*
      from public.veda_assignments va
     where va.brand_ambassador_id = p.id
       and va.organization_id = p.organization_id
       and va.status = 'active'
       and va.start_date <= lagos_d
       and (va.end_date is null or va.end_date >= lagos_d)
     order by va.start_date desc, va.created_at desc
  loop
    -- Every active school in this assigned region, with any live session.
    region_schools := '[]'::jsonb;
    for sch in
      select c.id as school_id, c.name as school_name, c.region as school_region,
             c.latitude as school_latitude, c.longitude as school_longitude,
             c.geofence_radius_metres
        from public.veda_schools c
       where c.organization_id = p.organization_id
         and c.status = 'active'
         and c.region = a.region
       order by c.name
    loop
      s := null;
      dists := '[]'::jsonb;
      session_json := null;

      select * into s from public.veda_sessions
        where brand_ambassador_id = p.id
          and school_id = sch.school_id
          and session_date = lagos_d
          and status <> 'cancelled'
        order by created_at desc limit 1;

      if s.id is not null then
        session_json := to_jsonb(s) - 'client_request_id';
        select coalesce(jsonb_agg(jsonb_build_object(
                 'id', d.id, 'stationery_item_id', d.stationery_item_id,
                 'item_name', it.name, 'item_code', it.code, 'quantity', d.quantity)
                 order by it.name), '[]'::jsonb)
          into dists
        from public.veda_session_distributions d
        join public.veda_stationery_items it on it.id = d.stationery_item_id
        where d.session_id = s.id;
      end if;

      region_schools := region_schools || jsonb_build_object(
        'school_id', sch.school_id,
        'school_name', sch.school_name,
        'school_region', sch.school_region,
        'school_latitude', sch.school_latitude,
        'school_longitude', sch.school_longitude,
        'geofence_radius_metres', sch.geofence_radius_metres,
        'session', session_json,
        'session_status', s.status,
        'learner_count', s.learner_count,
        'distributions', dists
      );
    end loop;

    regions := regions || jsonb_build_object(
      'region', a.region,
      'assignment_id', a.id,
      'weekly_off_day', a.weekly_off_day,
      'is_weekly_off_today', coalesce(a.weekly_off_day is not null and dow = ANY(a.weekly_off_day), false),
      'schools', region_schools
    );
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', it.id, 'name', it.name, 'code', it.code)
           order by it.name), '[]'::jsonb)
    into item_rows
  from public.veda_stationery_items it
  where it.organization_id = p.organization_id
    and it.status = 'active';

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', g.id, 'name', g.name, 'code', g.code, 'sort_order', g.sort_order)
           order by g.sort_order), '[]'::jsonb)
    into items
  from public.veda_grades g
  where g.organization_id = p.organization_id;

  return jsonb_build_object(
    'attendance_date', lagos_d,
    'regions', regions,
    'stationery_items', item_rows,
    'grades', items
  );
end;
$$;

-- ── 3. veda_checkin(): targeted by school within an assigned region ─────────
drop function if exists public.veda_checkin(double precision, double precision, text, text, uuid, uuid, uuid, double precision, integer, text);

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
  lagos_d    date;
  dow        int;
  sch        public.veda_schools%rowtype;
  region_ok  boolean;
  dist       double precision;
  radius     int;
  session_id uuid;
begin
  p := public.assert_active_ba();

  if p_school_id is null then
    raise exception 'A school is required to check in.';
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

  lagos_d := (now() at time zone 'Africa/Lagos')::date;
  dow     := extract(dow from lagos_d)::int;

  -- The chosen school must exist and be active in the BA's org.
  select * into sch from public.veda_schools
    where id = p_school_id
      and organization_id = p.organization_id
      and status = 'active';
  if sch.id is null then
    raise exception 'School not found or not active in your organization.';
  end if;

  -- Never trust the client: the school's region must be in one of the BA's
  -- active region assignments.
  region_ok := exists (
    select 1 from public.veda_assignments va
      where va.brand_ambassador_id = p.id
        and va.organization_id = p.organization_id
        and va.status = 'active'
        and va.region = sch.region
        and va.start_date <= lagos_d
        and (va.end_date is null or va.end_date >= lagos_d)
  );
  if not region_ok then
    raise exception '% is not in any of your assigned regions. Contact your supervisor.', sch.region;
  end if;

  -- Weekly off: if ANY active region assignment marks today off, block.
  perform 1 from public.veda_assignments va
   where va.brand_ambassador_id = p.id
     and va.organization_id = p.organization_id
     and va.status = 'active'
     and va.start_date <= lagos_d
     and (va.end_date is null or va.end_date >= lagos_d)
     and va.weekly_off_day is not null
     and dow = any(va.weekly_off_day)
   limit 1;
  if found then
    raise exception 'Today is your weekly off day';
  end if;

  if not (p_selfie_photo_path like p.organization_id::text || '/' || p.id::text || '/%')
     or not (p_stamped_document_path like p.organization_id::text || '/' || p.id::text || '/%') then
    raise exception 'Photo upload paths are invalid';
  end if;

  perform 1 from public.veda_sessions
   where brand_ambassador_id = p.id and school_id = sch.id
     and session_date = lagos_d and status <> 'cancelled'
   limit 1;
  if found then
    raise exception 'You have already checked in for this school visit today.';
  end if;

  dist   := public.distance_metres(p_latitude, p_longitude, sch.latitude, sch.longitude);
  radius := sch.geofence_radius_metres;
  if dist > radius then
    raise exception 'You are % m from % — check-in requires % m or less.',
      round(dist)::int, sch.name, radius;
  end if;

  insert into public.veda_sessions (
    organization_id, school_id, brand_ambassador_id, session_date,
    learner_count, status, checkin_at,
    checkin_latitude, checkin_longitude, checkin_distance_metres,
    notes, client_request_id
  ) values (
    p.organization_id, sch.id, p.id, lagos_d,
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
      'school_id', sch.id,
      'region', sch.region,
      'assignment_id', p_assignment_id,
      'distance_metres', round(dist::numeric, 1),
      'accuracy_metres', p_accuracy_metres,
      'source', 'region_school'
    )
  );

  prior := jsonb_build_object(
    'status', 'ok',
    'operation', 'veda_checkin',
    'session_id', session_id,
    'school_id', sch.id,
    'school_name', sch.name
  );
  perform public.complete_receipt(p_client_request_id, prior);
  return prior;
end;
$$;

-- ── 4. veda_admin_upsert_assignment(): assign regions to a BA ───────────────
drop function if exists public.veda_admin_upsert_assignment(uuid, uuid, smallint[], date, date, assignment_status, uuid);

create function public.veda_admin_upsert_assignment(
  p_brand_ambassador_id uuid,
  p_region              text,
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

  if nullif(btrim(p_region), '') is null then
    raise exception 'A region is required.';
  end if;

  off := public.normalize_off_days(p_weekly_off_day);
  if off = '{}'::smallint[] then off := null; end if;

  -- One active row per (BA, region).
  if p_assignment_id is null then
    if exists (
      select 1 from public.veda_assignments
       where brand_ambassador_id = p_brand_ambassador_id
         and region = btrim(p_region)
         and status = 'active'
    ) then
      raise exception '% is already assigned for this brand ambassador.', btrim(p_region);
    end if;

    insert into public.veda_assignments
      (organization_id, brand_ambassador_id, region, weekly_off_day, start_date, end_date, status)
    values
      (ba.organization_id, p_brand_ambassador_id, btrim(p_region), off,
       coalesce(p_start_date, current_date), p_end_date, p_status)
    returning id into v_id;

    perform public.write_audit('veda_assignment.create', 'veda_assignments', v_id,
      jsonb_build_object('ba', p_brand_ambassador_id, 'region', btrim(p_region),
                         'weekly_off_day', off));
  else
    update public.veda_assignments set
      region = btrim(p_region), weekly_off_day = off,
      start_date = coalesce(p_start_date, start_date),
      end_date = p_end_date, status = p_status
     where id = p_assignment_id
       and (actor.role = 'super_admin' or organization_id = actor.organization_id);

    if not found then raise exception 'Assignment not found'; end if;

    v_id := p_assignment_id;
    perform public.write_audit('veda_assignment.update', 'veda_assignments', v_id, null);
  end if;

  return v_id;
end;
$$;

-- ── 5. (Re)grant execute on the changed signatures ──────────────────────────
grant execute on function
  public.veda_today(),
  public.veda_checkin(double precision, double precision, text, text, uuid, uuid, uuid, double precision, integer, text),
  public.veda_admin_upsert_assignment(uuid, text, smallint[], date, date, assignment_status, uuid)
to authenticated;

commit;