-- Per-grade corrected documents are stored on booklist_grade_requests rather
-- than in booklist_jobs.formatted_document_id. Accept the job's `formatted`
-- requests themselves as equivalent evidence when every grade has a corrected
-- document. This preserves the approval gate without forcing a duplicate file.
create or replace function public.admin_advance_stage(
  p_job_id uuid,
  p_stage  public.booklist_stage,
  p_note   text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  j record;
begin
  p := public.assert_org_admin();

  select bj.*, s.name as school_name
    into j
    from public.booklist_jobs bj
    join public.veda_schools s on s.id = bj.school_id
   where bj.id = p_job_id and bj.organization_id = p.organization_id
   for update;

  if j.id is null then raise exception 'Booklist job not found'; end if;

  if p_stage = 'completed' and j.stamped_document_id is null then
    raise exception 'A job can only be completed once the school-stamped +1 copy is uploaded';
  end if;
  if p_stage = 'completed' and j.copies_requested is null then
    raise exception 'Record the copy count before completing this job';
  end if;
  if p_stage in ('pending_school_approval','school_approved')
     and j.formatted_document_id is null
     and not (
       exists (
         select 1 from public.booklist_grade_requests gr
         where gr.job_id = p_job_id
       )
       and not exists (
         select 1 from public.booklist_grade_requests gr
         where gr.job_id = p_job_id and gr.word_storage_path is null
       )
     ) then
    raise exception 'Publish the corrected document first';
  end if;
  if p_stage = 'school_approved' and j.copies_requested is null then
    raise exception 'Record how many copies the school needs';
  end if;
  if p_stage = 'cancelled' then
    update public.booklist_jobs
       set cancelled_reason = nullif(p_note, ''), updated_at = now()
     where id = p_job_id;
  end if;
  if p_stage = 'on_hold' then
    update public.booklist_jobs
       set on_hold_reason = nullif(p_note, ''), updated_at = now()
     where id = p_job_id;
  end if;
  if p_stage = 'received' then
    update public.booklist_jobs set received_at = coalesce(j.received_at, now()), updated_at = now()
     where id = p_job_id;
  end if;
  if p_stage = 'dispatched' then
    update public.booklist_jobs set dispatched_at = coalesce(j.dispatched_at, now()), updated_at = now()
     where id = p_job_id;
  end if;

  perform public.set_booklist_stage(p_job_id, p_stage, p.id, nullif(p_note, ''));

  return jsonb_build_object('status', 'ok', 'operation', 'admin_advance_stage',
                            'job_id', p_job_id, 'school_name', j.school_name, 'stage', p_stage);
end;
$$;

revoke all on function public.admin_advance_stage(uuid, public.booklist_stage, text) from public, anon;
grant execute on function public.admin_advance_stage(uuid, public.booklist_stage, text) to authenticated;
