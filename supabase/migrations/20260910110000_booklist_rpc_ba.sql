-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo — School booklist pipeline: Brand Ambassador RPCs.
--
-- Every mutation is SECURITY DEFINER and follows the house trust boundary:
--   1. identity / organization / role / approval derived from the JWT via
--      assert_active_ba() — client-supplied values are hints only;
--   2. the visit date is computed in the ORGANIZATION's timezone
--      (organizations.timezone), never hard-coded and never now()::date;
--   3. GPS distance is recomputed with distance_metres() and treated as
--      ADVISORY unless the tenant turns on geofence_enforced for that agency —
--      the imported school list has no coordinates, so a hard fence would
--      block every visit on day one;
--   4. retries are deduped through try_consume_receipt()/complete_receipt();
--   5. every action lands in audit_logs, and every stage change also lands in
--      booklist_stage_events so both dashboards can render the timeline.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── Internal helpers ────────────────────────────────────────────────────────

-- Storage paths must live under {organization_id}/{auth_uid}/ so a BA can never
-- claim or overwrite another tenant's or another BA's artefacts.
create or replace function public.assert_own_storage_path(
  p_path text, p_organization_id uuid, p_user_id uuid, p_label text default 'Upload'
)
returns void language plpgsql immutable security definer set search_path = public as $$
begin
  if p_path is null
     or p_path not like (p_organization_id::text || '/' || p_user_id::text || '/%')
     or length(p_path) <= length(p_organization_id::text || '/' || p_user_id::text || '/') then
    raise exception '% path is invalid', p_label;
  end if;
end;
$$;

-- Single funnel for stage transitions: guards the row, records the event, and
-- audits. A no-op transition writes nothing.
create or replace function public.set_booklist_stage(
  p_job_id uuid,
  p_to     public.booklist_stage,
  p_actor  uuid,
  p_note   text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  j         record;
  v_role    public.app_role;
begin
  select id, organization_id, stage
    into j
    from public.booklist_jobs
   where id = p_job_id
   for update;

  if j.id is null then
    raise exception 'Booklist job not found';
  end if;
  if j.stage is not distinct from p_to then
    return;
  end if;

  update public.booklist_jobs
     set stage            = p_to,
         stage_updated_at = now(),
         stage_updated_by = p_actor,
         completed_at     = case when p_to = 'completed' then coalesce(completed_at, now()) else completed_at end
   where id = p_job_id;

  select role into v_role from public.profiles where id = p_actor;

  insert into public.booklist_stage_events
    (organization_id, job_id, from_stage, to_stage, changed_by, changed_by_role, note)
  values
    (j.organization_id, p_job_id, j.stage, p_to, p_actor, v_role, nullif(p_note, ''));

  perform public.write_audit(
    'booklist_job.stage', 'booklist_jobs', p_job_id,
    jsonb_build_object('from', j.stage, 'to', p_to, 'note', p_note),
    p_actor, j.organization_id
  );
end;
$$;

-- Returns the caller's school-org profile, rejecting retail tenants.
create or replace function public.assert_school_ba()
returns public.profiles
language plpgsql stable security definer set search_path = public as $$
declare
  p public.profiles;
begin
  p := public.assert_active_ba();
  if not exists (
    select 1 from public.organizations o
    where o.id = p.organization_id and o.kind = 'schools'
  ) then
    raise exception 'School booklist actions are only available to school-programme ambassadors';
  end if;
  return p;
end;
$$;

-- Resolves the visit a follow-up step belongs to. The mobile app queues the
-- whole gate visit offline, so it knows the client_request_id it minted for
-- `ba_start_school_visit` long before it knows the resulting visit uuid.
create or replace function public.resolve_school_visit(
  p_visit_id                uuid,
  p_visit_client_request_id uuid,
  p_profile                 public.profiles
)
returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if p_visit_id is not null then
    select sv.id into v_id
      from public.school_visits sv
     where sv.id = p_visit_id
       and sv.brand_ambassador_id = p_profile.id
       and sv.organization_id = p_profile.organization_id;
  elsif p_visit_client_request_id is not null then
    select sv.id into v_id
      from public.school_visits sv
     where sv.client_request_id = p_visit_client_request_id
       and sv.brand_ambassador_id = p_profile.id
       and sv.organization_id = p_profile.organization_id
     order by sv.created_at desc
     limit 1;
  else
    raise exception 'A visit id or visit request id is required';
  end if;

  if v_id is null then raise exception 'Visit not found'; end if;
  return v_id;
end;
$$;

-- ── School discovery ────────────────────────────────────────────────────────
-- The BA picks from the existing 4,782-school master list, filtered to their
-- own tenant. Empty query returns the region-scoped head of the list.
create or replace function public.ba_search_schools(
  p_query  text default null,
  p_region text default null,
  p_limit  integer default 25
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p       public.profiles;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  q       text := nullif(btrim(coalesce(p_query, '')), '');
  r       text := nullif(btrim(coalesce(p_region, '')), '');
begin
  p := public.assert_school_ba();

  return jsonb_build_object(
    'status', 'ok',
    'regions', (
      select coalesce(jsonb_agg(distinct s.region order by s.region), '[]'::jsonb)
        from public.veda_schools s
       where s.organization_id = p.organization_id
         and s.status = 'active'
         and s.region is not null
    ),
    'schools', (
      select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.school_name), '[]'::jsonb)
        from (
          select s.id                                   as school_id,
                 s.name                                 as school_name,
                 s.region                               as school_region,
                 s.address                              as school_address,
                 s.latitude                             as latitude,
                 s.longitude                            as longitude,
                 (j.id is not null)                     as has_active_job,
                 j.stage                                as job_stage
            from public.veda_schools s
            left join lateral (
              select bj.id, bj.stage
                from public.booklist_jobs bj
               where bj.school_id = s.id
                 and bj.organization_id = s.organization_id
                 and bj.stage not in ('completed','cancelled')
               limit 1
            ) j on true
           where s.organization_id = p.organization_id
             and s.status = 'active'
             and (r is null or upper(s.region) = upper(r))
             and (q is null or s.name ilike '%' || q || '%')
           order by
             case when q is not null and lower(s.name) = lower(q) then 0
                  when q is not null and lower(s.name) like lower(q) || '%' then 1
                  else 2 end,
             s.name
           limit v_limit
        ) x
    )
  );
end;
$$;

-- ── BA self-serve school creation ───────────────────────────────────────────
-- The brief requires the BA to be able to input a school manually when it is
-- not on the list. Previously only admins could create schools.
create or replace function public.ba_create_school(
  p_name                 text,
  p_region               text default null,
  p_address              text default null,
  p_latitude             double precision default null,
  p_longitude            double precision default null,
  p_school_type          text default null,
  p_contact_person_name  text default null,
  p_contact_person_phone text default null,
  p_client_request_id    uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p          public.profiles;
  prior      jsonb;
  v_name     text := upper(btrim(coalesce(p_name, '')));
  v_region   text := upper(btrim(coalesce(p_region, '')));
  v_school   record;
  v_result   jsonb;
begin
  p := public.assert_school_ba();

  if length(v_name) < 3 then
    raise exception 'School name must be at least 3 characters';
  end if;
  if length(v_name) > 200 then
    raise exception 'School name is too long (max 200 characters)';
  end if;
  if p_latitude is not null and (p_latitude not between -90 and 90) then
    raise exception 'Latitude is out of range';
  end if;
  if p_longitude is not null and (p_longitude not between -180 and 180) then
    raise exception 'Longitude is out of range';
  end if;

  if p_client_request_id is not null then
    prior := public.try_consume_receipt(p_client_request_id, 'ba_create_school', p);
    if prior is not null and prior->>'status' = 'ok' then
      return prior;
    end if;
    if prior is not null and prior->>'status' = 'pending' then
      delete from public.operation_receipts where client_request_id = p_client_request_id;
    end if;
  end if;

  -- Exact-name dedupe within the tenant and region: two BAs must not create the
  -- same school twice.
  select s.* into v_school
    from public.veda_schools s
   where s.organization_id = p.organization_id
     and upper(btrim(s.name)) = v_name
     and (nullif(v_region, '') is null or upper(btrim(coalesce(s.region, ''))) = v_region)
   limit 1;

  if v_school.id is not null then
    v_result := jsonb_build_object(
      'status', 'ok', 'operation', 'ba_create_school',
      'school_id', v_school.id, 'school_name', v_school.name,
      'school_region', v_school.region, 'created', false
    );
    if p_client_request_id is not null then
      perform public.complete_receipt(p_client_request_id, v_result);
    end if;
    return v_result;
  end if;

  insert into public.veda_schools (
    organization_id, name, region, address, latitude, longitude,
    school_type, contact_person_name, contact_person_phone,
    status, geofence_radius_metres
  ) values (
    p.organization_id, v_name, nullif(v_region, ''), nullif(btrim(coalesce(p_address, '')), ''),
    p_latitude, p_longitude,
    nullif(btrim(coalesce(p_school_type, '')), ''),
    nullif(btrim(coalesce(p_contact_person_name, '')), ''),
    nullif(btrim(coalesce(p_contact_person_phone, '')), ''),
    'active', 200
  ) returning * into v_school;

  perform public.write_audit(
    'veda_school.ba_create', 'veda_schools', v_school.id,
    jsonb_build_object('name', v_school.name, 'region', v_school.region, 'created_by_ba', p.id),
    p.id, p.organization_id
  );

  v_result := jsonb_build_object(
    'status', 'ok', 'operation', 'ba_create_school',
    'school_id', v_school.id, 'school_name', v_school.name,
    'school_region', v_school.region, 'created', true
  );
  if p_client_request_id is not null then
    perform public.complete_receipt(p_client_request_id, v_result);
  end if;
  return v_result;
end;
$$;

-- ── Stage 1: approach the school, capture the gate selfie ───────────────────
create or replace function public.ba_start_school_visit(
  p_school_id            uuid,
  p_client_request_id    uuid,
  p_latitude             double precision default null,
  p_longitude            double precision default null,
  p_accuracy_metres      double precision default null,
  p_selfie_photo_path    text default null,
  p_contact_person_name  text default null,
  p_contact_person_role  text default null,
  p_contact_person_phone text default null,
  p_notes                text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p          public.profiles;
  prior      jsonb;
  org        public.organizations;
  rules      jsonb;
  v_date     date;
  v_selfie   text := nullif(btrim(coalesce(p_selfie_photo_path, '')), '');
  sch        record;
  dist       double precision;
  fence      public.geofence_outcome := 'not_checked';
  v_visit    uuid;
  v_job      uuid;
  v_stage    public.booklist_stage;
  v_result   jsonb;
begin
  p := public.assert_school_ba();

  select * into org from public.organizations where id = p.organization_id;
  if org.id is null then raise exception 'Organization not found'; end if;

  rules  := public.ba_visit_rules(p.organization_id, p.agency);
  v_date := (now() at time zone coalesce(org.timezone, 'UTC'))::date;

  prior := public.try_consume_receipt(p_client_request_id, 'ba_start_school_visit', p);
  if prior is not null and prior->>'visit_id' is not null then
    return prior;
  end if;
  if prior is not null and prior->>'status' = 'pending' then
    delete from public.operation_receipts where client_request_id = p_client_request_id;
  elsif prior is not null then
    return prior;
  end if;

  select s.id, s.name, s.region, s.latitude, s.longitude, s.geofence_radius_metres, s.status
    into sch
    from public.veda_schools s
   where s.id = p_school_id and s.organization_id = p.organization_id;

  if sch.id is null then
    raise exception 'School not found. Add it manually if it is not on the list.';
  end if;
  if sch.status <> 'active' then
    raise exception 'This school is not active';
  end if;

  -- Mandatory selfie for the agency (AEL). Enforced server-side, not in the UI.
  if (rules->>'selfie_required')::boolean and v_selfie is null then
    raise exception 'A gate selfie is mandatory for your agency (%). Take one at the school entrance.',
      coalesce(p.agency::text, 'unassigned');
  end if;

  if v_selfie is not null then
    perform public.assert_own_storage_path(v_selfie, p.organization_id, p.id, 'Selfie');
  end if;

  -- Advisory geofence: computed and stored always, enforced only if the tenant
  -- asks for it. Schools without coordinates cannot be fenced.
  if sch.latitude is not null and sch.longitude is not null
     and p_latitude is not null and p_longitude is not null then
    dist  := public.distance_metres(p_latitude, p_longitude, sch.latitude, sch.longitude);
    fence := case when dist <= sch.geofence_radius_metres then 'inside'::public.geofence_outcome
                  else 'outside'::public.geofence_outcome end;
    if fence = 'outside' and coalesce((rules->>'geofence_enforced')::boolean, false) then
      raise exception 'You are % m from % — check-in requires % m or less.',
        round(dist)::int, sch.name, sch.geofence_radius_metres;
    end if;
  elsif sch.latitude is null or sch.longitude is null then
    fence := 'no_coordinates';
  end if;

  insert into public.school_visits (
    organization_id, school_id, brand_ambassador_id, agency, selfie_required,
    visit_date, arrived_at, outcome,
    selfie_photo_path, selfie_captured_at,
    latitude, longitude, accuracy_metres, distance_metres, geofence_status,
    contact_person_name, contact_person_role, contact_person_phone,
    notes, client_request_id
  ) values (
    p.organization_id, p_school_id, p.id, p.agency,
    coalesce((rules->>'selfie_required')::boolean, false),
    v_date, now(), 'pending',
    v_selfie, case when v_selfie is not null then now() else null end,
    p_latitude, p_longitude, p_accuracy_metres, round(dist::numeric, 1)::double precision, fence,
    nullif(btrim(coalesce(p_contact_person_name, '')), ''),
    nullif(btrim(coalesce(p_contact_person_role, '')), ''),
    nullif(btrim(coalesce(p_contact_person_phone, '')), ''),
    nullif(p_notes, ''), p_client_request_id
  ) returning id into v_visit;

  -- One live pipeline record per school. Re-engaging a declined school reopens
  -- the same job rather than forking the history.
  select bj.id, bj.stage into v_job, v_stage
    from public.booklist_jobs bj
   where bj.school_id = p_school_id
     and bj.organization_id = p.organization_id
     and bj.stage not in ('completed','cancelled')
   limit 1
   for update;

  if v_job is null then
    insert into public.booklist_jobs (organization_id, school_id, stage, owner_ba_id, latest_visit_id)
    values (p.organization_id, p_school_id, 'engaged', p.id, v_visit)
    returning id into v_job;

    insert into public.booklist_stage_events
      (organization_id, job_id, from_stage, to_stage, changed_by, changed_by_role, note)
    values (p.organization_id, v_job, null, 'engaged', p.id, p.role, 'BA approached the school');

    perform public.write_audit('booklist_job.create', 'booklist_jobs', v_job,
      jsonb_build_object('school_id', p_school_id, 'visit_id', v_visit), p.id, p.organization_id);
  else
    update public.booklist_jobs
       set latest_visit_id = v_visit,
           owner_ba_id     = coalesce(owner_ba_id, p.id),
           updated_at      = now()
     where id = v_job;

    -- A declined school being revisited reopens the pipeline.
    if v_stage = 'declined' then
      perform public.set_booklist_stage(v_job, 'engaged', p.id, 'School re-engaged after a decline');
    end if;
  end if;

  v_result := jsonb_build_object(
    'status', 'ok', 'operation', 'ba_start_school_visit',
    'visit_id', v_visit, 'job_id', v_job,
    'school_id', sch.id, 'school_name', sch.name,
    'visit_date', v_date,
    'selfie_required', coalesce((rules->>'selfie_required')::boolean, false),
    'geofence_status', fence,
    'distance_metres', round(dist::numeric, 1)
  );
  perform public.complete_receipt(p_client_request_id, v_result);
  return v_result;
end;
$$;

-- ── Stage 2: record what the principal said ─────────────────────────────────
create or replace function public.ba_record_visit_outcome(
  p_visit_id                uuid default null,
  p_outcome                 public.visit_outcome default 'pending',
  p_client_request_id       uuid default null,
  p_declined_reason_code    text default null,
  p_declined_reason_notes   text default null,
  p_contact_person_name     text default null,
  p_contact_person_role     text default null,
  p_contact_person_phone    text default null,
  p_is_per_grade            boolean default null,
  p_notes                   text default null,
  p_visit_client_request_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p        public.profiles;
  prior    jsonb;
  v        record;
  v_visit  uuid;
  v_job    uuid;
  v_result jsonb;
begin
  p := public.assert_school_ba();

  prior := public.try_consume_receipt(p_client_request_id, 'ba_record_visit_outcome', p);
  if prior is not null and prior->>'status' = 'ok' then return prior; end if;
  if prior is not null and prior->>'status' = 'pending' then
    delete from public.operation_receipts where client_request_id = p_client_request_id;
  elsif prior is not null then return prior; end if;

  v_visit := public.resolve_school_visit(p_visit_id, p_visit_client_request_id, p);

  select sv.*, s.name as school_name
    into v
    from public.school_visits sv
    join public.veda_schools s on s.id = sv.school_id
   where sv.id = v_visit
     and sv.brand_ambassador_id = p.id
     and sv.organization_id = p.organization_id
   for update of sv;

  if v.id is null then
    raise exception 'Visit not found';
  end if;
  if p_outcome = 'pending' then
    raise exception 'Choose an outcome: declined or booklist offered';
  end if;
  if p_outcome = 'declined'
     and nullif(btrim(coalesce(p_declined_reason_code, '')), '') is null
     and nullif(btrim(coalesce(p_declined_reason_notes, '')), '') is null then
    raise exception 'Record why the school declined';
  end if;

  update public.school_visits
     set outcome               = p_outcome,
         declined_reason_code  = case when p_outcome = 'declined'
                                      then nullif(btrim(coalesce(p_declined_reason_code, '')), '') end,
         declined_reason_notes = case when p_outcome = 'declined'
                                      then nullif(btrim(coalesce(p_declined_reason_notes, '')), '') end,
         contact_person_name   = coalesce(nullif(btrim(coalesce(p_contact_person_name, '')), ''), contact_person_name),
         contact_person_role   = coalesce(nullif(btrim(coalesce(p_contact_person_role, '')), ''), contact_person_role),
         contact_person_phone  = coalesce(nullif(btrim(coalesce(p_contact_person_phone, '')), ''), contact_person_phone),
         notes                 = coalesce(nullif(p_notes, ''), notes),
         updated_at            = now()
   where id = v_visit;

  select bj.id into v_job
    from public.booklist_jobs bj
   where bj.school_id = v.school_id
     and bj.organization_id = p.organization_id
     and bj.stage not in ('completed','cancelled')
   limit 1
   for update;

  if v_job is null then
    insert into public.booklist_jobs (organization_id, school_id, stage, owner_ba_id, latest_visit_id)
    values (p.organization_id, v.school_id,
            case when p_outcome = 'declined' then 'declined'::public.booklist_stage
                 else 'booklist_offered'::public.booklist_stage end,
            p.id, v_visit)
    returning id into v_job;

    insert into public.booklist_stage_events
      (organization_id, job_id, from_stage, to_stage, changed_by, changed_by_role, note)
    values (p.organization_id, v_job, null,
            case when p_outcome = 'declined' then 'declined'::public.booklist_stage
                 else 'booklist_offered'::public.booklist_stage end,
            p.id, p.role, 'Outcome recorded at first contact');
  else
    update public.booklist_jobs
       set latest_visit_id = v_visit,
           is_per_grade    = coalesce(p_is_per_grade, is_per_grade),
           updated_at      = now()
     where id = v_job;

    if p_outcome = 'declined' then
      perform public.set_booklist_stage(v_job, 'declined', p.id,
        coalesce(nullif(btrim(coalesce(p_declined_reason_code, '')), ''), 'School declined'));
    else
      -- Never regress a job that already has a document in flight.
      perform public.set_booklist_stage(v_job, 'booklist_offered', p.id, 'School offered the booklist');
    end if;
  end if;

  perform public.write_audit('school_visit.outcome', 'school_visits', v_visit,
    jsonb_build_object(
      'outcome', p_outcome,
      'declined_reason_code', p_declined_reason_code,
      'school_id', v.school_id, 'job_id', v_job
    ), p.id, p.organization_id);

  v_result := jsonb_build_object(
    'status', 'ok', 'operation', 'ba_record_visit_outcome',
    'visit_id', v_visit, 'job_id', v_job,
    'school_name', v.school_name, 'outcome', p_outcome
  );
  perform public.complete_receipt(p_client_request_id, v_result);
  return v_result;
end;
$$;

-- ── Stage 3: upload the booklist itself ─────────────────────────────────────
-- Image, softcopy, scan or a photo of a handwritten list — all land as a
-- raw_upload document and the job joins the conversion queue.
create or replace function public.ba_submit_booklist_document(
  p_visit_id                uuid default null,
  p_storage_path            text default null,
  p_client_request_id       uuid default null,
  p_mime_type               text default null,
  p_file_size_bytes         bigint default null,
  p_page_count              integer default null,
  p_source_format           text default null,
  p_captured_on_site        boolean default true,
  p_is_per_grade            boolean default null,
  p_grade_notes             text default null,
  p_notes                   text default null,
  p_visit_client_request_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p        public.profiles;
  prior    jsonb;
  v        record;
  v_visit  uuid;
  v_job    uuid;
  v_doc    uuid;
  v_result jsonb;
begin
  p := public.assert_school_ba();

  perform public.assert_own_storage_path(p_storage_path, p.organization_id, p.id, 'Document');

  prior := public.try_consume_receipt(p_client_request_id, 'ba_submit_booklist_document', p);
  if prior is not null and prior->>'document_id' is not null then return prior; end if;
  if prior is not null and prior->>'status' = 'pending' then
    delete from public.operation_receipts where client_request_id = p_client_request_id;
  elsif prior is not null then return prior; end if;

  v_visit := public.resolve_school_visit(p_visit_id, p_visit_client_request_id, p);

  select sv.*, s.name as school_name
    into v
    from public.school_visits sv
    join public.veda_schools s on s.id = sv.school_id
   where sv.id = v_visit
     and sv.brand_ambassador_id = p.id
     and sv.organization_id = p.organization_id;

  if v.id is null then raise exception 'Visit not found'; end if;

  select bj.id into v_job
    from public.booklist_jobs bj
   where bj.school_id = v.school_id
     and bj.organization_id = p.organization_id
     and bj.stage not in ('completed','cancelled')
   limit 1
   for update;

  if v_job is null then
    insert into public.booklist_jobs (organization_id, school_id, stage, owner_ba_id, latest_visit_id)
    values (p.organization_id, v.school_id, 'booklist_offered', p.id, v_visit)
    returning id into v_job;
  end if;

  -- Supersede any earlier current raw upload; history is retained.
  update public.booklist_documents
     set is_current = false, updated_at = now()
   where job_id = v_job and kind = 'raw_upload' and is_current;

  insert into public.booklist_documents (
    organization_id, job_id, visit_id, kind, storage_bucket, storage_path,
    mime_type, file_size_bytes, page_count, source_format, captured_on_site,
    uploaded_by, is_current, ocr_status, client_request_id
  ) values (
    p.organization_id, v_job, v_visit, 'raw_upload', 'booklist-documents', p_storage_path,
    nullif(p_mime_type, ''), p_file_size_bytes, p_page_count,
    nullif(btrim(coalesce(p_source_format, '')), ''), coalesce(p_captured_on_site, true),
    p.id, true, 'queued', p_client_request_id
  ) returning id into v_doc;

  update public.booklist_jobs
     set raw_document_id      = v_doc,
         ocr_status           = 'queued',
         document_received_at = now(),
         is_per_grade         = coalesce(p_is_per_grade, is_per_grade),
         grade_notes          = coalesce(nullif(p_grade_notes, ''), grade_notes),
         latest_visit_id      = v_visit,
         updated_at           = now()
   where id = v_job;

  -- Uploading the list also settles the visit outcome if the BA skipped that step.
  update public.school_visits
     set outcome = 'booklist_offered', notes = coalesce(nullif(p_notes, ''), notes), updated_at = now()
   where id = v_visit and outcome = 'pending';

  perform public.set_booklist_stage(v_job, 'awaiting_conversion', p.id,
    'Raw booklist uploaded — queued for conversion to Word');

  v_result := jsonb_build_object(
    'status', 'ok', 'operation', 'ba_submit_booklist_document',
    'document_id', v_doc, 'job_id', v_job, 'visit_id', v_visit,
    'school_name', v.school_name, 'stage', 'awaiting_conversion'
  );
  perform public.complete_receipt(p_client_request_id, v_result);
  return v_result;
end;
$$;

-- ── Stage 4: BA collected the formatted Word file and took printouts back ───
create or replace function public.ba_mark_pending_school_approval(
  p_job_id            uuid,
  p_client_request_id uuid,
  p_notes             text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p     public.profiles;
  prior jsonb;
  j     record;
  res   jsonb;
begin
  p := public.assert_school_ba();

  prior := public.try_consume_receipt(p_client_request_id, 'ba_mark_pending_school_approval', p);
  if prior is not null and prior->>'status' = 'ok' then return prior; end if;
  if prior is not null and prior->>'status' = 'pending' then
    delete from public.operation_receipts where client_request_id = p_client_request_id;
  elsif prior is not null then return prior; end if;

  select bj.*, s.name as school_name
    into j
    from public.booklist_jobs bj
    join public.veda_schools s on s.id = bj.school_id
   where bj.id = p_job_id
     and bj.organization_id = p.organization_id
     and (bj.owner_ba_id = p.id or exists (
           select 1 from public.school_visits v
            where v.id = bj.latest_visit_id and v.brand_ambassador_id = p.id))
   for update;

  if j.id is null then raise exception 'Booklist job not found'; end if;
  if j.formatted_document_id is null then
    raise exception 'The formatted Word document is not ready yet. Wait for the admin to finish it.';
  end if;

  perform public.set_booklist_stage(p_job_id, 'pending_school_approval', p.id,
    coalesce(nullif(p_notes, ''), 'BA downloaded and printed the document for school approval'));

  res := jsonb_build_object('status', 'ok', 'operation', 'ba_mark_pending_school_approval',
                            'job_id', p_job_id, 'school_name', j.school_name,
                            'stage', 'pending_school_approval');
  perform public.complete_receipt(p_client_request_id, res);
  return res;
end;
$$;

-- ── Stage 5: school approved and stated how many copies it needs ────────────
-- The +1 stamped copy is derived, never supplied by the client.
create or replace function public.ba_confirm_copies(
  p_job_id                 uuid,
  p_copies_requested       integer,
  p_client_request_id      uuid,
  p_school_acknowledged_by text default null,
  p_notes                  text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p     public.profiles;
  prior jsonb;
  j     record;
  res   jsonb;
begin
  p := public.assert_school_ba();

  if p_copies_requested is null or p_copies_requested < 1 then
    raise exception 'Enter how many copies the school needs (at least 1)';
  end if;
  if p_copies_requested > 100000 then
    raise exception 'Copy count looks too large — confirm with your supervisor';
  end if;

  prior := public.try_consume_receipt(p_client_request_id, 'ba_confirm_copies', p);
  if prior is not null and prior->>'status' = 'ok' then return prior; end if;
  if prior is not null and prior->>'status' = 'pending' then
    delete from public.operation_receipts where client_request_id = p_client_request_id;
  elsif prior is not null then return prior; end if;

  select bj.*, s.name as school_name
    into j
    from public.booklist_jobs bj
    join public.veda_schools s on s.id = bj.school_id
   where bj.id = p_job_id
     and bj.organization_id = p.organization_id
     and (bj.owner_ba_id = p.id or exists (
           select 1 from public.school_visits v
            where v.id = bj.latest_visit_id and v.brand_ambassador_id = p.id))
   for update;

  if j.id is null then raise exception 'Booklist job not found'; end if;
  if j.formatted_document_id is null then
    raise exception 'Copies can only be confirmed once the formatted document exists';
  end if;

  update public.booklist_jobs
     set copies_requested       = p_copies_requested,
         copies_confirmed_at    = now(),
         copies_confirmed_by    = p.id,
         school_acknowledged_by = nullif(btrim(coalesce(p_school_acknowledged_by, '')), ''),
         approved_by_school_at  = now(),
         updated_at             = now()
   where id = p_job_id;

  perform public.set_booklist_stage(p_job_id, 'school_approved', p.id,
    format('School approved %s copies (+1 stamped = %s to print)',
           p_copies_requested, p_copies_requested + 1));

  perform public.write_audit('booklist_job.copies_confirmed', 'booklist_jobs', p_job_id,
    jsonb_build_object('copies_requested', p_copies_requested,
                       'copies_to_print', p_copies_requested + 1,
                       'acknowledged_by', p_school_acknowledged_by,
                       'notes', p_notes), p.id, p.organization_id);

  res := jsonb_build_object('status', 'ok', 'operation', 'ba_confirm_copies',
                            'job_id', p_job_id, 'school_name', j.school_name,
                            'copies_requested', p_copies_requested,
                            'copies_to_print', p_copies_requested + 1,
                            'stage', 'school_approved');
  perform public.complete_receipt(p_client_request_id, res);
  return res;
end;
$$;

-- ── Stage 6: the stamped +1 copy — completes the log ────────────────────────
create or replace function public.ba_submit_stamped_copy(
  p_job_id            uuid,
  p_storage_path      text,
  p_client_request_id uuid,
  p_mime_type         text default null,
  p_file_size_bytes   bigint default null,
  p_notes             text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p     public.profiles;
  prior jsonb;
  j     record;
  v_doc uuid;
  res   jsonb;
begin
  p := public.assert_school_ba();

  perform public.assert_own_storage_path(p_storage_path, p.organization_id, p.id, 'Stamped copy');

  prior := public.try_consume_receipt(p_client_request_id, 'ba_submit_stamped_copy', p);
  if prior is not null and prior->>'document_id' is not null then return prior; end if;
  if prior is not null and prior->>'status' = 'pending' then
    delete from public.operation_receipts where client_request_id = p_client_request_id;
  elsif prior is not null then return prior; end if;

  select bj.*, s.name as school_name
    into j
    from public.booklist_jobs bj
    join public.veda_schools s on s.id = bj.school_id
   where bj.id = p_job_id
     and bj.organization_id = p.organization_id
     and (bj.owner_ba_id = p.id or exists (
           select 1 from public.school_visits v
            where v.id = bj.latest_visit_id and v.brand_ambassador_id = p.id))
   for update;

  if j.id is null then raise exception 'Booklist job not found'; end if;
  if j.copies_requested is null then
    raise exception 'Record how many copies the school needs before uploading the stamped copy';
  end if;

  update public.booklist_documents
     set is_current = false, updated_at = now()
   where job_id = p_job_id and kind = 'stamped_copy' and is_current;

  insert into public.booklist_documents (
    organization_id, job_id, visit_id, kind, storage_bucket, storage_path,
    mime_type, file_size_bytes, source_format, captured_on_site,
    uploaded_by, is_current, client_request_id
  ) values (
    p.organization_id, p_job_id, j.latest_visit_id, 'stamped_copy', 'booklist-documents', p_storage_path,
    nullif(p_mime_type, ''), p_file_size_bytes, 'photo', true,
    p.id, true, p_client_request_id
  ) returning id into v_doc;

  update public.booklist_documents set ocr_status = 'not_required' where id = v_doc;

  update public.booklist_jobs
     set stamped_document_id = v_doc,
         received_at         = coalesce(received_at, now()),
         updated_at          = now()
   where id = p_job_id;

  perform public.set_booklist_stage(p_job_id, 'completed', p.id,
    coalesce(nullif(p_notes, ''), 'School-stamped +1 copy uploaded — complete log'));

  res := jsonb_build_object('status', 'ok', 'operation', 'ba_submit_stamped_copy',
                            'document_id', v_doc, 'job_id', p_job_id,
                            'school_name', j.school_name, 'stage', 'completed');
  perform public.complete_receipt(p_client_request_id, res);
  return res;
end;
$$;

-- ── BA pipeline list ────────────────────────────────────────────────────────
create or replace function public.ba_school_pipeline(
  p_query text default null,
  p_stage public.booklist_stage default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p       public.profiles;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  q       text := nullif(btrim(coalesce(p_query, '')), '');
begin
  p := public.assert_school_ba();

  return jsonb_build_object(
    'status', 'ok',
    'counts', (
      select jsonb_build_object(
        'total',     count(*),
        'completed', count(*) filter (where bj.stage = 'completed'),
        'declined',  count(*) filter (where bj.stage = 'declined'),
        'active',    count(*) filter (where bj.stage not in ('completed','cancelled','declined')),
        'awaiting_admin', count(*) filter (where bj.stage in ('awaiting_conversion','converting'))
      )
      from public.booklist_jobs bj
      where bj.organization_id = p.organization_id
        and (bj.owner_ba_id = p.id or exists (
              select 1 from public.school_visits v
               where v.id = bj.latest_visit_id and v.brand_ambassador_id = p.id))
    ),
    'jobs', (
      select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.stage_updated_at desc), '[]'::jsonb)
      from (
        select bj.id                                  as job_id,
               bj.stage,
               bj.school_id,
               s.name                                 as school_name,
               s.region                               as school_region,
               bj.copies_requested,
               bj.copies_to_print,
               bj.is_per_grade,
               bj.document_received_at,
               bj.formatted_at,
               bj.approved_by_school_at,
               bj.dispatched_at,
               bj.received_at,
               bj.completed_at,
               bj.stage_updated_at,
               (bj.formatted_document_id is not null) as formatted_ready,
               (bj.stamped_document_id is not null)   as stamped_uploaded,
               ba.full_name                           as owner_ba_name,
               ba.id                                  as owner_ba_id
          from public.booklist_jobs bj
          join public.veda_schools s on s.id = bj.school_id
          left join public.profiles ba on ba.id = bj.owner_ba_id
         where bj.organization_id = p.organization_id
           and (bj.owner_ba_id = p.id or exists (
                 select 1 from public.school_visits v
                  where v.id = bj.latest_visit_id and v.brand_ambassador_id = p.id))
           and (p_stage is null or bj.stage = p_stage)
           and (q is null or s.name ilike '%' || q || '%' or coalesce(s.region, '') ilike '%' || q || '%')
         order by bj.stage_updated_at desc
         limit v_limit
      ) x
    )
  );
end;
$$;

-- ── BA job detail: everything needed to render one school's journey ─────────
create or replace function public.ba_school_job_detail(p_job_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p public.profiles;
  j record;
begin
  p := public.assert_school_ba();

  select bj.*, s.name as school_name, s.region as school_region, s.address as school_address
    into j
    from public.booklist_jobs bj
    join public.veda_schools s on s.id = bj.school_id
   where bj.id = p_job_id
     and bj.organization_id = p.organization_id
     and (bj.owner_ba_id = p.id
          or public.can_read_org(bj.organization_id)
          or exists (select 1 from public.school_visits v
                      where v.id = bj.latest_visit_id and v.brand_ambassador_id = p.id));

  if j.id is null then
    raise exception 'Booklist job not found';
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'job', to_jsonb(j),
    'visits', (
      select coalesce(jsonb_agg(row_to_json(v)::jsonb order by v.arrived_at desc), '[]'::jsonb)
      from (
        select sv.id, sv.visit_date, sv.arrived_at, sv.outcome, sv.agency,
               sv.selfie_photo_path, sv.selfie_required, sv.geofence_status,
               sv.distance_metres, sv.accuracy_metres,
               sv.contact_person_name, sv.contact_person_role, sv.contact_person_phone,
               sv.declined_reason_code, sv.declined_reason_notes, sv.notes,
               pr.full_name as ba_name
          from public.school_visits sv
          join public.profiles pr on pr.id = sv.brand_ambassador_id
         where sv.school_id = j.school_id and sv.organization_id = j.organization_id
      ) v
    ),
    'documents', (
      select coalesce(jsonb_agg(row_to_json(d)::jsonb order by d.created_at desc), '[]'::jsonb)
      from (
        select bd.id, bd.kind, bd.storage_path, bd.storage_bucket, bd.mime_type,
               bd.file_size_bytes, bd.page_count, bd.source_format, bd.is_current,
               bd.ocr_status, bd.ocr_confidence, bd.ocr_error, bd.created_at,
               pr.full_name as uploaded_by_name
          from public.booklist_documents bd
          left join public.profiles pr on pr.id = bd.uploaded_by
         where bd.job_id = p_job_id
      ) d
    ),
    'print_orders', (
      select coalesce(jsonb_agg(row_to_json(o)::jsonb order by o.created_at desc), '[]'::jsonb)
      from (
        select po.* from public.print_orders po where po.job_id = p_job_id
      ) o
    ),
    'timeline', (
      select coalesce(jsonb_agg(row_to_json(e)::jsonb order by e.created_at desc), '[]'::jsonb)
      from (
        select se.id, se.from_stage, se.to_stage, se.note, se.created_at,
               pr.full_name as changed_by_name, se.changed_by_role
          from public.booklist_stage_events se
          left join public.profiles pr on pr.id = se.changed_by
         where se.job_id = p_job_id
      ) e
    )
  );
end;
$$;

-- ── BA performance: how many schools they actually reached ──────────────────
create or replace function public.ba_visit_stats()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p        public.profiles;
  org      public.organizations;
  rules    jsonb;
  v_today  date;
  m_start  date;
  m_end    date;
  tgt      record;
begin
  p := public.assert_school_ba();
  select * into org from public.organizations where id = p.organization_id;
  rules   := public.ba_visit_rules(p.organization_id, p.agency);
  v_today := (now() at time zone coalesce(org.timezone, 'UTC'))::date;
  m_start := date_trunc('month', v_today)::date;
  m_end   := (m_start + interval '1 month - 1 day')::date;

  select t.* into tgt
    from public.ba_school_targets t
   where t.brand_ambassador_id = p.id
     and t.period_start <= v_today and t.period_end >= v_today
   order by t.period_start desc
   limit 1;

  return jsonb_build_object(
    'status', 'ok',
    'agency', p.agency,
    'selfie_required', (rules->>'selfie_required')::boolean,
    'geofence_enforced', coalesce((rules->>'geofence_enforced')::boolean, false),
    'today', v_today,
    'visits_today', (
      select count(*) from public.school_visits v
       where v.brand_ambassador_id = p.id and v.visit_date = v_today
    ),
    'visits_this_month', (
      select count(*) from public.school_visits v
       where v.brand_ambassador_id = p.id and v.visit_date between m_start and m_end
    ),
    'schools_visited_total', (
      select count(distinct v.school_id) from public.school_visits v
       where v.brand_ambassador_id = p.id
    ),
    'schools_visited_this_month', (
      select count(distinct v.school_id) from public.school_visits v
       where v.brand_ambassador_id = p.id and v.visit_date between m_start and m_end
    ),
    'booklists_collected', (
      select count(*) from public.school_visits v
       where v.brand_ambassador_id = p.id and v.outcome = 'booklist_offered'
    ),
    'declines_recorded', (
      select count(*) from public.school_visits v
       where v.brand_ambassador_id = p.id and v.outcome = 'declined'
    ),
    'selfie_compliance', (
      select jsonb_build_object(
        'required', count(*) filter (where v.selfie_required),
        'captured', count(*) filter (where v.selfie_required and v.selfie_photo_path is not null),
        'missing',  count(*) filter (where v.selfie_required and v.selfie_photo_path is null)
      )
      from public.school_visits v where v.brand_ambassador_id = p.id
    ),
    'target', case when tgt.id is null then null else jsonb_build_object(
        'period_start', tgt.period_start, 'period_end', tgt.period_end,
        'target_schools', tgt.target_schools
      ) end,
    'default_target_schools_per_month', rules->'target_schools_per_month'
  );
end;
$$;

-- ── Grants ──────────────────────────────────────────────────────────────────
grant execute on function public.ba_search_schools(text, text, integer) to authenticated;
grant execute on function public.ba_create_school(text, text, text, double precision, double precision, text, text, text, uuid) to authenticated;
grant execute on function public.ba_start_school_visit(uuid, uuid, double precision, double precision, double precision, text, text, text, text, text) to authenticated;
grant execute on function public.ba_record_visit_outcome(uuid, public.visit_outcome, uuid, text, text, text, text, text, boolean, text, uuid) to authenticated;
grant execute on function public.ba_submit_booklist_document(uuid, text, uuid, text, bigint, integer, text, boolean, boolean, text, text, uuid) to authenticated;
grant execute on function public.ba_mark_pending_school_approval(uuid, uuid, text) to authenticated;
grant execute on function public.ba_confirm_copies(uuid, integer, uuid, text, text) to authenticated;
grant execute on function public.ba_submit_stamped_copy(uuid, text, uuid, text, bigint, text) to authenticated;
grant execute on function public.ba_school_pipeline(text, public.booklist_stage, integer) to authenticated;
grant execute on function public.ba_school_job_detail(uuid) to authenticated;
grant execute on function public.ba_visit_stats() to authenticated;

-- Internal helpers stay locked down.
revoke execute on function public.assert_own_storage_path(text, uuid, uuid, text) from public, anon;
revoke execute on function public.set_booklist_stage(uuid, public.booklist_stage, uuid, text) from public, anon;
revoke execute on function public.assert_school_ba() from public, anon;
revoke execute on function public.resolve_school_visit(uuid, uuid, public.profiles) from public, anon;
revoke execute on function public.ba_visit_rules(uuid, public.ba_agency) from public, anon;
revoke execute on function public.can_read_booklist_document(text) from public, anon;
revoke execute on function public.backfill_school_coordinates() from public, anon;

commit;
