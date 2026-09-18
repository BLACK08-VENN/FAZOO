-- School approvals must reuse the quantities the BA captured with each
-- uploaded booklist. Re-entering one school-level number loses per-grade +1s
-- and makes the approval step unnecessarily error-prone.
create or replace function public.ba_approve_existing_booklist_quantities(
  p_job_id uuid,
  p_client_request_id uuid,
  p_school_acknowledged_by text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.profiles;
  prior jsonb;
  j record;
  v_requested integer;
  v_to_print integer;
  v_result jsonb;
begin
  p := public.assert_school_ba();

  prior := public.try_consume_receipt(
    p_client_request_id,
    'ba_approve_existing_booklist_quantities',
    p
  );
  if prior is not null and prior->>'status' = 'ok' then return prior; end if;
  if prior is not null and prior->>'status' = 'pending' then
    delete from public.operation_receipts where client_request_id = p_client_request_id;
  elsif prior is not null then
    return prior;
  end if;

  select bj.*, s.name as school_name
    into j
    from public.booklist_jobs bj
    join public.veda_schools s on s.id = bj.school_id
   where bj.id = p_job_id
     and bj.organization_id = p.organization_id
     and (
       bj.owner_ba_id = p.id
       or exists (
         select 1
           from public.school_visits v
          where v.id = bj.latest_visit_id
            and v.brand_ambassador_id = p.id
       )
     )
   for update of bj;

  if j.id is null then raise exception 'Booklist job not found'; end if;
  if j.stage <> 'pending_school_approval' then
    raise exception 'This booklist is not waiting for school approval';
  end if;

  select sum(gr.copies_requested)::integer, sum(gr.copies_to_print)::integer
    into v_requested, v_to_print
    from public.booklist_grade_requests gr
   where gr.job_id = p_job_id;

  v_requested := coalesce(v_requested, j.copies_requested);
  v_to_print := coalesce(v_to_print, j.copies_to_print);
  if v_requested is null or v_requested < 1 then
    raise exception 'No saved copy quantity was found for this booklist';
  end if;

  update public.booklist_jobs
     set copies_requested = v_requested,
         copies_confirmed_at = now(),
         copies_confirmed_by = p.id,
         school_acknowledged_by = nullif(btrim(coalesce(p_school_acknowledged_by, '')), ''),
         approved_by_school_at = now(),
         updated_at = now()
   where id = p_job_id;

  perform public.set_booklist_stage(
    p_job_id,
    'school_approved',
    p.id,
    format('School approved saved quantities (%s requested; %s including stamped copies)', v_requested, v_to_print)
  );

  perform public.write_audit(
    'booklist_job.quantities_approved',
    'booklist_jobs',
    p_job_id,
    jsonb_build_object(
      'copies_requested', v_requested,
      'copies_to_print', v_to_print,
      'acknowledged_by', p_school_acknowledged_by,
      'notes', p_notes
    ),
    p.id,
    p.organization_id
  );

  v_result := jsonb_build_object(
    'status', 'ok',
    'operation', 'ba_approve_existing_booklist_quantities',
    'job_id', p_job_id,
    'school_name', j.school_name,
    'copies_requested', v_requested,
    'copies_to_print', v_to_print,
    'stage', 'school_approved'
  );
  perform public.complete_receipt(p_client_request_id, v_result);
  return v_result;
end;
$$;

revoke all on function public.ba_approve_existing_booklist_quantities(uuid, uuid, text, text) from public, anon;
grant execute on function public.ba_approve_existing_booklist_quantities(uuid, uuid, text, text) to authenticated;

-- Return the grade-derived totals to the BA UI. A school with three grades
-- receives three stamped copies, so the parent job's generated `+1` total is
-- not the correct display value for per-grade work.
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
        'copies_requested', coalesce(g.copies_requested, bj.copies_requested),
        'copies_to_print', coalesce(g.copies_to_print, bj.copies_to_print),
        'due_date', bj.due_date,
        'follow_up_date', bj.follow_up_date,
        'follow_up_notes', bj.follow_up_notes,
        'formatted_document_id', bj.formatted_document_id
      ) order by x.ord
    ),
    '[]'::jsonb
  ) into jobs
  from jsonb_array_elements(coalesce(base->'jobs', '[]'::jsonb))
       with ordinality as x(item, ord)
  left join public.booklist_jobs bj
    on bj.id = (x.item->>'job_id')::uuid
   and bj.organization_id = p.organization_id
  left join lateral (
    select sum(gr.copies_requested)::integer as copies_requested,
           sum(gr.copies_to_print)::integer as copies_to_print
      from public.booklist_grade_requests gr
     where gr.job_id = bj.id
  ) g on true;

  return jsonb_set(base, '{jobs}', jobs, true);
end;
$$;

revoke all on function public.ba_school_pipeline_v2(text, public.booklist_stage, integer) from public, anon;
grant execute on function public.ba_school_pipeline_v2(text, public.booklist_stage, integer) to authenticated;
