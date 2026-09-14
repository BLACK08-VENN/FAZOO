-- Accept the original attachment in any format and queue it for admin conversion.
create or replace function public.ba_submit_grade_booklist(
  p_job_id uuid,
  p_visit_id uuid,
  p_grade_label text,
  p_copies_requested integer,
  p_due_date date,
  p_storage_path text,
  p_client_request_id uuid,
  p_mime_type text default null,
  p_file_size_bytes bigint default null,
  p_source_format text default null,
  p_sort_order integer default 0
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.profiles;
  prior jsonb;
  j record;
  v record;
  v_grade_id uuid;
  v_timezone text;
  v_today date;
  v_overall_due date;
  v_grade_notes text;
  v_result jsonb;
begin
  p := public.assert_school_ba();

  if p_client_request_id is null then raise exception 'A client request id is required'; end if;
  if p_visit_id is null then raise exception 'A school visit is required'; end if;
  if nullif(btrim(coalesce(p_grade_label, '')), '') is null then raise exception 'Enter the grade or class name'; end if;
  if char_length(btrim(p_grade_label)) > 100 then raise exception 'Grade or class name is too long'; end if;
  if p_copies_requested is null or p_copies_requested < 1 then raise exception 'Enter how many copies this grade needs'; end if;
  if p_copies_requested > 100000 then raise exception 'Copy quantity is too large'; end if;
  if p_due_date is null then raise exception 'Enter the date the school needs the printed booklists'; end if;
  if nullif(btrim(coalesce(p_source_format, '')), '') is null then raise exception 'Choose how this grade supplied the booklist'; end if;

  perform public.assert_own_storage_path(p_storage_path, p.organization_id, p.id, 'Document');

  select o.timezone into v_timezone from public.organizations o where o.id = p.organization_id;
  v_today := (now() at time zone coalesce(v_timezone, 'UTC'))::date;
  if p_due_date < v_today then raise exception 'The due date cannot be in the past'; end if;

  prior := public.try_consume_receipt(p_client_request_id, 'ba_submit_grade_booklist', p);
  if prior is not null and prior->>'grade_request_id' is not null then return prior; end if;
  if prior is not null and prior->>'status' = 'pending' then
    delete from public.operation_receipts where client_request_id = p_client_request_id;
  elsif prior is not null then
    return prior;
  end if;

  select bj.id, bj.school_id, bj.stage, bj.owner_ba_id, bj.latest_visit_id, s.name as school_name
    into j
    from public.booklist_jobs bj
    join public.veda_schools s on s.id = bj.school_id
   where bj.id = p_job_id
     and bj.organization_id = p.organization_id
     and (
       bj.owner_ba_id = p.id
       or exists (
         select 1 from public.school_visits own_visit
         where own_visit.id = bj.latest_visit_id
           and own_visit.brand_ambassador_id = p.id
       )
     )
   for update of bj;

  if j.id is null then raise exception 'Booklist job not found'; end if;
  if j.stage = 'engaged' then raise exception 'Record whether the school supplied or denied the booklist first'; end if;
  if j.stage in ('declined', 'cancelled', 'completed') then raise exception 'This booklist job cannot accept another grade at its current stage'; end if;

  select sv.id, sv.school_id into v
    from public.school_visits sv
   where sv.id = p_visit_id
     and sv.organization_id = p.organization_id
     and sv.brand_ambassador_id = p.id;

  if v.id is null or v.school_id is distinct from j.school_id then
    raise exception 'This visit does not belong to the selected school';
  end if;

  if exists (
    select 1 from public.booklist_grade_requests gr
    where gr.job_id = p_job_id
      and lower(btrim(gr.grade_label)) = lower(btrim(p_grade_label))
  ) then
    raise exception 'A booklist for this grade or class has already been added';
  end if;

  insert into public.booklist_grade_requests (
    organization_id, job_id, visit_id, grade_label, copies_requested,
    copies_to_print, due_date, source_format, storage_path,
    mime_type, file_size_bytes, sort_order, created_by, client_request_id
  ) values (
    p.organization_id, p_job_id, p_visit_id, btrim(p_grade_label), p_copies_requested,
    p_copies_requested + 1, p_due_date, btrim(p_source_format), p_storage_path,
    nullif(p_mime_type, ''), p_file_size_bytes, coalesce(p_sort_order, 0), p.id, p_client_request_id
  ) returning id into v_grade_id;

  select
    min(gr.due_date),
    string_agg(gr.grade_label, ', ' order by gr.sort_order, gr.created_at)
  into v_overall_due, v_grade_notes
  from public.booklist_grade_requests gr
  where gr.job_id = p_job_id;

  update public.booklist_jobs
     set copies_requested = null,
         due_date = v_overall_due,
         is_per_grade = true,
         grade_notes = v_grade_notes,
         document_received_at = coalesce(document_received_at, now()),
         latest_visit_id = p_visit_id,
         updated_at = now()
   where id = p_job_id;

  update public.school_visits
     set outcome = 'booklist_offered', updated_at = now()
   where id = p_visit_id and outcome = 'pending';

  perform public.set_booklist_stage(
    p_job_id,
    'document_received',
    p.id,
    'Grade booklist uploaded: ' || btrim(p_grade_label)
  );

  perform public.write_audit(
    'booklist_job.grade_request',
    'booklist_jobs',
    p_job_id,
    jsonb_build_object(
      'grade_request_id', v_grade_id,
      'grade_label', btrim(p_grade_label),
      'copies_requested', p_copies_requested,
      'copies_to_print', p_copies_requested + 1,
      'due_date', p_due_date,
      'storage_path', p_storage_path
    ),
    p.id,
    p.organization_id
  );

  v_result := jsonb_build_object(
    'status', 'ok',
    'operation', 'ba_submit_grade_booklist',
    'job_id', p_job_id,
    'visit_id', p_visit_id,
    'school_name', j.school_name,
    'grade_request_id', v_grade_id,
    'grade_label', btrim(p_grade_label),
    'copies_requested', p_copies_requested,
    'copies_to_print', p_copies_requested + 1,
    'due_date', p_due_date,
    'stage', 'document_received',
    'word_ready', false,
    'conversion_required', true
  );

  perform public.complete_receipt(p_client_request_id, v_result);
  return v_result;
end;
$$;

-- Publish the Word file the admin prepared from the BA's original attachment.
create function public.admin_publish_grade_word(
  p_grade_request_id uuid,
  p_storage_path text,
  p_file_size_bytes bigint,
  p_client_request_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor public.profiles%rowtype;
  v_grade public.booklist_grade_requests%rowtype;
  v_prior public.operation_receipts%rowtype;
  v_result jsonb;
begin
  select * into v_actor from public.profiles where id = auth.uid();
  if v_actor.id is null or v_actor.account_status <> 'approved'
     or v_actor.role not in ('super_admin', 'organization_admin') then
    raise exception 'Only approved admins can publish Word documents' using errcode = '42501';
  end if;
  if p_client_request_id is null then raise exception 'Request ID is required'; end if;
  select * into v_prior from public.operation_receipts where client_request_id = p_client_request_id for update;
  if found then
    if v_prior.operation <> 'admin_publish_grade_word'
       or v_prior.brand_ambassador_id <> v_actor.id
       or v_prior.result->>'grade_request_id' <> p_grade_request_id::text then
      raise exception 'Request ID already used' using errcode = '23505';
    end if;
    return v_prior.result;
  end if;
  select * into v_grade from public.booklist_grade_requests where id = p_grade_request_id for update;
  if not found then raise exception 'Grade request not found'; end if;
  if v_actor.role = 'organization_admin' and v_actor.organization_id <> v_grade.organization_id then
    raise exception 'Not authorized for this organization' using errcode = '42501';
  end if;
  if p_storage_path is null
     or p_storage_path not like v_grade.organization_id::text || '/grade-requests/' || v_grade.id::text || '/manual-%'
     or lower(p_storage_path) not like '%.docx'
     or p_file_size_bytes is null or p_file_size_bytes < 1 or p_file_size_bytes > 20971520 then
    raise exception 'Invalid Word document';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'booklist-documents' and name = p_storage_path) then
    raise exception 'Word document was not uploaded';
  end if;
  update public.booklist_grade_requests set
    word_storage_bucket = 'booklist-documents', word_storage_path = p_storage_path,
    word_mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    word_size_bytes = p_file_size_bytes, word_published_at = now(), word_published_by = v_actor.id,
    conversion_status = 'succeeded', conversion_provider = 'manual', conversion_error = null,
    conversion_finished_at = now()
  where id = v_grade.id;
  if not exists (
    select 1 from public.booklist_grade_requests
    where job_id = v_grade.job_id and word_storage_path is null
  ) then
    perform public.set_booklist_stage(v_grade.job_id, 'formatted', v_actor.id, 'All grade Word documents published');
  end if;
  perform public.write_audit('booklist_grade.word_published', 'booklist_grade_requests', v_grade.id,
    jsonb_build_object('storage_path', p_storage_path, 'file_size_bytes', p_file_size_bytes),
    v_actor.id, v_grade.organization_id);
  v_result := jsonb_build_object('status', 'ok', 'grade_request_id', v_grade.id, 'word_ready', true);
  insert into public.operation_receipts
    (organization_id, brand_ambassador_id, client_request_id, operation, result)
  values (v_grade.organization_id, v_actor.id, p_client_request_id, 'admin_publish_grade_word', v_result);
  return v_result;
end;
$$;
revoke all on function public.admin_publish_grade_word(uuid, text, bigint, uuid) from public, anon;
grant execute on function public.admin_publish_grade_word(uuid, text, bigint, uuid) to authenticated;
