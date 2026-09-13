alter type public.visit_outcome add value if not exists 'follow_up';

alter table public.school_visits
  add column if not exists follow_up_date date,
  add column if not exists follow_up_notes text;

alter table public.booklist_jobs
  add column if not exists follow_up_date date,
  add column if not exists follow_up_notes text;

create index if not exists booklist_jobs_follow_up_idx
  on public.booklist_jobs (organization_id, follow_up_date)
  where follow_up_date is not null and stage = 'on_hold';

create or replace function public.ba_schedule_booklist_follow_up(
  p_visit_id uuid,
  p_follow_up_date date,
  p_follow_up_notes text default null,
  p_client_request_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.profiles;
  prior jsonb;
  v record;
  v_job uuid;
  v_job_stage public.booklist_stage;
  v_result jsonb;
begin
  p := public.assert_school_ba();

  if p_follow_up_date is null then
    raise exception 'Choose the date the school asked you to return';
  end if;
  if p_follow_up_date < (now() at time zone 'Africa/Nairobi')::date then
    raise exception 'Follow-up date cannot be in the past';
  end if;

  prior := public.try_consume_receipt(p_client_request_id, 'ba_schedule_booklist_follow_up', p);
  if prior is not null and prior->>'status' = 'ok' then return prior; end if;
  if prior is not null and prior->>'status' = 'pending' then
    delete from public.operation_receipts where client_request_id = p_client_request_id;
  elsif prior is not null then
    return prior;
  end if;

  select sv.*, s.name as school_name
    into v
    from public.school_visits sv
    join public.veda_schools s on s.id = sv.school_id
   where sv.id = p_visit_id
     and sv.brand_ambassador_id = p.id
     and sv.organization_id = p.organization_id
   for update of sv;

  if v.id is null then
    raise exception 'Visit not found';
  end if;

  update public.school_visits
     set outcome = 'follow_up'::public.visit_outcome,
         follow_up_date = p_follow_up_date,
         follow_up_notes = nullif(btrim(coalesce(p_follow_up_notes, '')), ''),
         declined_reason_code = null,
         declined_reason_notes = null,
         updated_at = now()
   where id = p_visit_id;

  select bj.id, bj.stage
    into v_job, v_job_stage
    from public.booklist_jobs bj
   where bj.school_id = v.school_id
     and bj.organization_id = p.organization_id
     and bj.stage not in ('completed','cancelled')
   limit 1
   for update;

  if v_job is null then
    insert into public.booklist_jobs (
      organization_id, school_id, stage, owner_ba_id, latest_visit_id,
      follow_up_date, follow_up_notes, on_hold_reason,
      stage_updated_at, stage_updated_by
    ) values (
      p.organization_id, v.school_id, 'on_hold'::public.booklist_stage, p.id, p_visit_id,
      p_follow_up_date, nullif(btrim(coalesce(p_follow_up_notes, '')), ''),
      concat('Follow-up scheduled for ', to_char(p_follow_up_date, 'DD Mon YYYY')),
      now(), p.id
    ) returning id into v_job;

    insert into public.booklist_stage_events
      (organization_id, job_id, from_stage, to_stage, changed_by, changed_by_role, note)
    values (
      p.organization_id, v_job, null, 'on_hold'::public.booklist_stage,
      p.id, p.role,
      concat('School asked BA to return on ', to_char(p_follow_up_date, 'DD Mon YYYY'))
    );
  else
    if v_job_stage not in ('engaged','booklist_offered','declined','on_hold') then
      raise exception 'This school already has a booklist further along in the workflow';
    end if;

    update public.booklist_jobs
       set latest_visit_id = p_visit_id,
           owner_ba_id = coalesce(owner_ba_id, p.id),
           follow_up_date = p_follow_up_date,
           follow_up_notes = nullif(btrim(coalesce(p_follow_up_notes, '')), ''),
           on_hold_reason = concat('Follow-up scheduled for ', to_char(p_follow_up_date, 'DD Mon YYYY')),
           updated_at = now()
     where id = v_job;

    perform public.set_booklist_stage(
      v_job,
      'on_hold'::public.booklist_stage,
      p.id,
      concat('School asked BA to return on ', to_char(p_follow_up_date, 'DD Mon YYYY'))
    );
  end if;

  perform public.write_audit(
    'school_visit.follow_up', 'school_visits', p_visit_id,
    jsonb_build_object(
      'school_id', v.school_id,
      'job_id', v_job,
      'follow_up_date', p_follow_up_date,
      'follow_up_notes', nullif(btrim(coalesce(p_follow_up_notes, '')), '')
    ),
    p.id, p.organization_id
  );

  v_result := jsonb_build_object(
    'status', 'ok',
    'operation', 'ba_schedule_booklist_follow_up',
    'visit_id', p_visit_id,
    'job_id', v_job,
    'school_name', v.school_name,
    'outcome', 'follow_up',
    'follow_up_date', p_follow_up_date
  );
  perform public.complete_receipt(p_client_request_id, v_result);
  return v_result;
end;
$$;

revoke all on function public.ba_schedule_booklist_follow_up(uuid, date, text, uuid) from public;
grant execute on function public.ba_schedule_booklist_follow_up(uuid, date, text, uuid) to authenticated;

create or replace function public.ba_record_visit_outcome(
  p_visit_id uuid default null,
  p_outcome public.visit_outcome default 'pending'::public.visit_outcome,
  p_client_request_id uuid default null,
  p_declined_reason_code text default null,
  p_declined_reason_notes text default null,
  p_contact_person_name text default null,
  p_contact_person_role text default null,
  p_contact_person_phone text default null,
  p_is_per_grade boolean default null,
  p_notes text default null,
  p_visit_client_request_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  if v.id is null then raise exception 'Visit not found'; end if;
  if p_outcome in ('pending'::public.visit_outcome, 'follow_up'::public.visit_outcome) then
    raise exception 'Choose supplied or denied here; use follow-up scheduling when the school asks you to return later';
  end if;
  if p_outcome = 'declined'
     and nullif(btrim(coalesce(p_declined_reason_code, '')), '') is null
     and nullif(btrim(coalesce(p_declined_reason_notes, '')), '') is null then
    raise exception 'Record why the school declined';
  end if;

  update public.school_visits
     set outcome               = p_outcome,
         declined_reason_code  = case when p_outcome = 'declined' then nullif(btrim(coalesce(p_declined_reason_code, '')), '') end,
         declined_reason_notes = case when p_outcome = 'declined' then nullif(btrim(coalesce(p_declined_reason_notes, '')), '') end,
         contact_person_name   = coalesce(nullif(btrim(coalesce(p_contact_person_name, '')), ''), contact_person_name),
         contact_person_role   = coalesce(nullif(btrim(coalesce(p_contact_person_role, '')), ''), contact_person_role),
         contact_person_phone  = coalesce(nullif(btrim(coalesce(p_contact_person_phone, '')), ''), contact_person_phone),
         notes                 = coalesce(nullif(p_notes, ''), notes),
         follow_up_date        = null,
         follow_up_notes       = null,
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
    values (
      p.organization_id, v.school_id,
      case when p_outcome = 'declined' then 'declined'::public.booklist_stage else 'booklist_offered'::public.booklist_stage end,
      p.id, v_visit
    ) returning id into v_job;

    insert into public.booklist_stage_events
      (organization_id, job_id, from_stage, to_stage, changed_by, changed_by_role, note)
    values (
      p.organization_id, v_job, null,
      case when p_outcome = 'declined' then 'declined'::public.booklist_stage else 'booklist_offered'::public.booklist_stage end,
      p.id, p.role, 'Outcome recorded at first contact'
    );
  else
    update public.booklist_jobs
       set latest_visit_id = v_visit,
           is_per_grade = coalesce(p_is_per_grade, is_per_grade),
           follow_up_date = null,
           follow_up_notes = null,
           on_hold_reason = null,
           updated_at = now()
     where id = v_job;

    if p_outcome = 'declined' then
      perform public.set_booklist_stage(
        v_job, 'declined'::public.booklist_stage, p.id,
        coalesce(nullif(btrim(coalesce(p_declined_reason_code, '')), ''), 'School declined')
      );
    else
      perform public.set_booklist_stage(v_job, 'booklist_offered'::public.booklist_stage, p.id, 'School offered the booklist');
    end if;
  end if;

  perform public.write_audit(
    'school_visit.outcome', 'school_visits', v_visit,
    jsonb_build_object(
      'outcome', p_outcome,
      'declined_reason_code', p_declined_reason_code,
      'school_id', v.school_id,
      'job_id', v_job
    ), p.id, p.organization_id
  );

  v_result := jsonb_build_object(
    'status', 'ok', 'operation', 'ba_record_visit_outcome',
    'visit_id', v_visit, 'job_id', v_job,
    'school_name', v.school_name, 'outcome', p_outcome
  );
  perform public.complete_receipt(p_client_request_id, v_result);
  return v_result;
end;
$$;

create or replace function public.ba_school_pipeline_v2(
  p_query text default null,
  p_stage public.booklist_stage default null,
  p_limit integer default 50
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.profiles;
  base jsonb;
  jobs jsonb;
begin
  p := public.assert_school_ba();
  base := public.ba_school_pipeline(p_query, p_stage, p_limit);

  select coalesce(
    jsonb_agg(
      x.item || jsonb_build_object(
        'due_date', bj.due_date,
        'follow_up_date', bj.follow_up_date,
        'follow_up_notes', bj.follow_up_notes
      ) order by x.ord
    ),
    '[]'::jsonb
  ) into jobs
  from jsonb_array_elements(coalesce(base->'jobs', '[]'::jsonb))
       with ordinality as x(item, ord)
  left join public.booklist_jobs bj
    on bj.id = (x.item->>'job_id')::uuid
   and bj.organization_id = p.organization_id;

  return jsonb_set(base, '{jobs}', jobs, true);
end;
$$;