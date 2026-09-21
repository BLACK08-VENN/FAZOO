-- Accept Word (.docx/.doc) and PDF uploads as a grade's final document.
-- The MIME type is always derived and verified server-side; a client hint is
-- only honoured when it matches the stored file extension.
create or replace function public.admin_publish_grade_word(
  p_grade_request_id uuid,
  p_storage_path text,
  p_file_size_bytes bigint,
  p_client_request_id uuid,
  p_mime_type text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor public.profiles%rowtype;
  v_grade public.booklist_grade_requests%rowtype;
  v_prior public.operation_receipts%rowtype;
  v_mime  text;
  v_result jsonb;
begin
  select * into v_actor from public.profiles where id = auth.uid();
  if v_actor.id is null or v_actor.account_status <> 'approved'
     or v_actor.role not in ('super_admin', 'organization_admin') then
    raise exception 'Only approved admins can publish documents' using errcode = '42501';
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

  -- Derive the authoritative MIME from the extension, unless the caller's hint
  -- is one of the three allowed values (still checked against the extension).
  v_mime := lower(nullif(btrim(coalesce(p_mime_type, '')), ''));
  if v_mime not in (
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/pdf'
  ) then
    v_mime := case
      when lower(p_storage_path) like '%.pdf' then 'application/pdf'
      when lower(p_storage_path) like '%.doc' then 'application/msword'
      else 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    end;
  end if;

  if p_storage_path is null
     or p_storage_path not like v_grade.organization_id::text || '/grade-requests/' || v_grade.id::text || '/manual-%'
     or (lower(p_storage_path) not like '%.docx'
         and lower(p_storage_path) not like '%.doc'
         and lower(p_storage_path) not like '%.pdf')
     or not (
        (v_mime = 'application/pdf' and lower(p_storage_path) like '%.pdf')
        or (v_mime = 'application/msword' and lower(p_storage_path) like '%.doc')
        or (v_mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            and lower(p_storage_path) like '%.docx')
     )
     or p_file_size_bytes is null or p_file_size_bytes < 1 or p_file_size_bytes > 20971520 then
    raise exception 'Invalid document';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'booklist-documents' and name = p_storage_path) then
    raise exception 'Document was not uploaded';
  end if;
  update public.booklist_grade_requests set
    word_storage_bucket = 'booklist-documents', word_storage_path = p_storage_path,
    word_mime_type = v_mime,
    word_size_bytes = p_file_size_bytes, word_published_at = now(), word_published_by = v_actor.id,
    conversion_status = 'succeeded', conversion_provider = 'manual', conversion_error = null,
    conversion_finished_at = now()
  where id = v_grade.id;
  if not exists (
    select 1 from public.booklist_grade_requests
    where job_id = v_grade.job_id and word_storage_path is null
  ) then
    perform public.set_booklist_stage(v_grade.job_id, 'formatted', v_actor.id, 'All grade documents published');
  end if;
  perform public.write_audit('booklist_grade.word_published', 'booklist_grade_requests', v_grade.id,
    jsonb_build_object('storage_path', p_storage_path, 'mime_type', v_mime, 'file_size_bytes', p_file_size_bytes),
    v_actor.id, v_grade.organization_id);
  v_result := jsonb_build_object('status', 'ok', 'grade_request_id', v_grade.id, 'word_ready', true);
  insert into public.operation_receipts
    (organization_id, brand_ambassador_id, client_request_id, operation, result)
  values (v_grade.organization_id, v_actor.id, p_client_request_id, 'admin_publish_grade_word', v_result);
  return v_result;
end;
$$;

revoke all on function public.admin_publish_grade_word(uuid, text, bigint, uuid, text) from public, anon;
grant execute on function public.admin_publish_grade_word(uuid, text, bigint, uuid, text) to authenticated;

-- Record the true source format on the formatted document so a published PDF
-- is not mislabelled as a Word file.
create or replace function public.admin_publish_formatted_document(
  p_job_id          uuid,
  p_storage_path    text,
  p_mime_type       text default 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  p_file_size_bytes bigint default null,
  p_page_count      integer default null,
  p_is_per_grade    boolean default null,
  p_note            text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p     public.profiles;
  v_doc uuid;
  j     record;
  v_source_format text;
begin
  p := public.assert_org_admin();

  select bj.*, s.name as school_name
    into j
    from public.booklist_jobs bj
    join public.veda_schools s on s.id = bj.school_id
   where bj.id = p_job_id and bj.organization_id = p.organization_id
   for update;

  if j.id is null then raise exception 'Booklist job not found'; end if;
  if nullif(btrim(coalesce(p_storage_path, '')), '') is null then
    raise exception 'A formatted document is required';
  end if;

  v_source_format := case lower(nullif(btrim(coalesce(p_mime_type, '')), ''))
    when 'application/pdf' then 'pdf'
    when 'application/msword' then 'doc'
    when 'application/rtf' then 'rtf'
    else 'docx'
  end;

  update public.booklist_documents
     set is_current = false, updated_at = now()
   where job_id = p_job_id and kind = 'formatted' and is_current;

  insert into public.booklist_documents (
    organization_id, job_id, kind, storage_bucket, storage_path, mime_type,
    file_size_bytes, page_count, source_format, captured_on_site,
    uploaded_by, is_current, ocr_status
  ) values (
    p.organization_id, p_job_id, 'formatted', 'booklist-documents', btrim(p_storage_path),
    nullif(p_mime_type, ''), p_file_size_bytes, p_page_count, v_source_format, false,
    p.id, true, 'not_required'
  ) returning id into v_doc;

  update public.booklist_jobs
     set formatted_document_id = v_doc,
         formatted_at          = now(),
         converted_at          = now(),
         converted_by          = p.id,
         ocr_status            = case when ocr_status in ('queued','processing') then 'succeeded' else ocr_status end,
         is_per_grade          = coalesce(p_is_per_grade, is_per_grade),
         updated_at            = now()
   where id = p_job_id;

  perform public.set_booklist_stage(p_job_id, 'formatted', p.id,
    coalesce(nullif(p_note, ''), 'Formatted document published — ready for the BA to download and print'));

  return jsonb_build_object('status', 'ok', 'operation', 'admin_publish_formatted_document',
                            'job_id', p_job_id, 'document_id', v_doc,
                            'school_name', j.school_name, 'stage', 'formatted');
end;
$$;