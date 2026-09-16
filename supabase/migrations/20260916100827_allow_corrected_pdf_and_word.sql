-- Corrected grade documents may be supplied as legacy Word, modern Word, or
-- PDF. Keep the existing RPC signature so deployed clients remain compatible.
create or replace function public.admin_publish_grade_word(
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
  v_mime_type text;
begin
  select * into v_actor from public.profiles where id = auth.uid();
  if v_actor.id is null or v_actor.account_status <> 'approved'
     or v_actor.role not in ('super_admin', 'organization_admin') then
    raise exception 'Only approved admins can publish corrected documents' using errcode = '42501';
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
     or lower(p_storage_path) !~ '\.(doc|docx|pdf)$'
     or p_file_size_bytes is null or p_file_size_bytes < 1 or p_file_size_bytes > 20971520 then
    raise exception 'Invalid corrected document';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'booklist-documents' and name = p_storage_path) then
    raise exception 'Corrected document was not uploaded';
  end if;

  v_mime_type := case
    when lower(p_storage_path) like '%.pdf' then 'application/pdf'
    when lower(p_storage_path) like '%.doc' then 'application/msword'
    else 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  end;

  update public.booklist_grade_requests set
    word_storage_bucket = 'booklist-documents', word_storage_path = p_storage_path,
    word_mime_type = v_mime_type,
    word_size_bytes = p_file_size_bytes, word_published_at = now(), word_published_by = v_actor.id,
    conversion_status = 'succeeded', conversion_provider = 'manual', conversion_error = null,
    conversion_finished_at = now()
  where id = v_grade.id;
  if not exists (
    select 1 from public.booklist_grade_requests
    where job_id = v_grade.job_id and word_storage_path is null
  ) then
    perform public.set_booklist_stage(v_grade.job_id, 'formatted', v_actor.id, 'All corrected grade documents published');
  end if;
  perform public.write_audit('booklist_grade.word_published', 'booklist_grade_requests', v_grade.id,
    jsonb_build_object('storage_path', p_storage_path, 'file_size_bytes', p_file_size_bytes, 'mime_type', v_mime_type),
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
