-- Capture the school's print request at the moment the BA receives the booklist.
-- This keeps quantity and due date with the original collection record so the
-- admin can convert to Word and proceed directly to printing and dispatch.

create or replace function public.ba_capture_booklist_request(
  p_job_id             uuid,
  p_copies_requested   integer,
  p_due_date           date,
  p_client_request_id  uuid,
  p_note               text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p          public.profiles;
  prior      jsonb;
  j          record;
  v_timezone text;
  v_today    date;
  v_result   jsonb;
begin
  p := public.assert_school_ba();

  if p_client_request_id is null then
    raise exception 'A client request id is required';
  end if;
  if p_copies_requested is null or p_copies_requested < 1 then
    raise exception 'Enter how many copies the school wants printed';
  end if;
  if p_copies_requested > 100000 then
    raise exception 'Copy quantity is too large';
  end if;
  if p_due_date is null then
    raise exception 'Enter the date the school needs the printed booklists';
  end if;

  select o.timezone into v_timezone
    from public.organizations o
   where o.id = p.organization_id;
  v_today := (now() at time zone coalesce(v_timezone, 'UTC'))::date;
  if p_due_date < v_today then
    raise exception 'The due date cannot be in the past';
  end if;

  prior := public.try_consume_receipt(p_client_request_id, 'ba_capture_booklist_request', p);
  if prior is not null and prior->>'status' = 'ok' then
    return prior;
  end if;
  if prior is not null and prior->>'status' = 'pending' then
    delete from public.operation_receipts
     where client_request_id = p_client_request_id;
  elsif prior is not null then
    return prior;
  end if;

  select bj.id, bj.stage, bj.owner_ba_id, bj.latest_visit_id, s.name as school_name
    into j
    from public.booklist_jobs bj
    join public.veda_schools s on s.id = bj.school_id
   where bj.id = p_job_id
     and bj.organization_id = p.organization_id
     and (
       bj.owner_ba_id = p.id
       or exists (
         select 1
           from public.school_visits sv
          where sv.id = bj.latest_visit_id
            and sv.brand_ambassador_id = p.id
       )
     )
   for update of bj;

  if j.id is null then
    raise exception 'Booklist job not found';
  end if;
  if j.stage = 'engaged' then
    raise exception 'Record whether the school supplied or denied the booklist first';
  end if;
  if j.stage in ('declined', 'cancelled', 'completed') then
    raise exception 'This booklist job cannot accept a print request at its current stage';
  end if;

  update public.booklist_jobs
     set copies_requested   = p_copies_requested,
         copies_confirmed_at = now(),
         copies_confirmed_by = p.id,
         due_date            = p_due_date,
         updated_at          = now()
   where id = p_job_id;

  perform public.write_audit(
    'booklist_job.collection_request',
    'booklist_jobs',
    p_job_id,
    jsonb_build_object(
      'copies_requested', p_copies_requested,
      'copies_to_print', p_copies_requested + 1,
      'due_date', p_due_date,
      'includes_stamped_copy', true,
      'note', nullif(btrim(coalesce(p_note, '')), '')
    ),
    p.id,
    p.organization_id
  );

  v_result := jsonb_build_object(
    'status', 'ok',
    'operation', 'ba_capture_booklist_request',
    'job_id', p_job_id,
    'school_name', j.school_name,
    'copies_requested', p_copies_requested,
    'copies_to_print', p_copies_requested + 1,
    'due_date', p_due_date,
    'includes_stamped_copy', true
  );

  perform public.complete_receipt(p_client_request_id, v_result);
  return v_result;
end;
$$;

-- The existing BA pipeline remains the canonical list. This wrapper adds the
-- due date without changing older clients that already consume ba_school_pipeline.
create or replace function public.ba_school_pipeline_v2(
  p_query text default null,
  p_stage public.booklist_stage default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p      public.profiles;
  base   jsonb;
  jobs   jsonb;
begin
  p := public.assert_school_ba();
  base := public.ba_school_pipeline(p_query, p_stage, p_limit);

  select coalesce(
    jsonb_agg(
      x.item || jsonb_build_object('due_date', bj.due_date)
      order by x.ord
    ),
    '[]'::jsonb
  )
  into jobs
  from jsonb_array_elements(coalesce(base->'jobs', '[]'::jsonb))
       with ordinality as x(item, ord)
  left join public.booklist_jobs bj
    on bj.id = (x.item->>'job_id')::uuid
   and bj.organization_id = p.organization_id;

  return jsonb_set(base, '{jobs}', jobs, true);
end;
$$;

grant execute on function public.ba_capture_booklist_request(uuid, integer, date, uuid, text) to authenticated;
grant execute on function public.ba_school_pipeline_v2(text, public.booklist_stage, integer) to authenticated;
