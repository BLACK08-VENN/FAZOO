-- Remove recognition entry points. Historical metadata and document files are
-- retained so old records, audit trails and installed clients remain readable.
drop function if exists public.admin_record_ocr_result(uuid,public.ocr_status,text,numeric,text,text,text,bigint,integer,uuid);
drop function if exists public.admin_booklist_queue(public.ocr_status,integer);

create function public.admin_document_preparation_queue(p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.profiles; v_limit integer:=least(greatest(coalesce(p_limit,100),1),500);
begin
  select * into p from public.profiles where id=auth.uid() and account_status='approved' and role in ('super_admin','organization_admin','supervisor');
  if p.id is null then raise exception 'Approved staff access required' using errcode='42501'; end if;
  return jsonb_build_object(
    'status','ok',
    'queue',(
      select coalesce(jsonb_agg(to_jsonb(x) order by document_received_at nulls first,school_name),'[]'::jsonb)
      from (
        select j.id as job_id,j.stage,j.school_id,s.name as school_name,s.region as school_region,j.document_received_at,
          d.id as document_id,d.storage_path,d.storage_bucket,d.mime_type,d.file_size_bytes,d.page_count,d.source_format,
          ba.full_name as ba_name,ba.agency as ba_agency
        from public.booklist_jobs j
        join public.veda_schools s on s.id=j.school_id
        left join public.profiles ba on ba.id=j.owner_ba_id
        left join public.booklist_documents d on d.id=j.raw_document_id and d.is_current
        where j.organization_id=p.organization_id and j.stage in ('document_received','awaiting_conversion','converting')
        order by j.document_received_at nulls first,s.name,j.id
        limit v_limit
      ) x
    ),
    'counts',(
      select jsonb_build_object(
        'awaiting_preparation',count(*) filter(where j.stage in ('document_received','awaiting_conversion','converting')),
        'missing_original',count(*) filter(where j.stage in ('document_received','awaiting_conversion','converting') and not exists(select 1 from public.booklist_documents d where d.id=j.raw_document_id and d.is_current)),
        'formatted_ready',count(*) filter(where j.stage='formatted')
      ) from public.booklist_jobs j where j.organization_id=p.organization_id
    )
  );
end $$;
revoke all on function public.admin_document_preparation_queue(integer) from public,anon;
grant execute on function public.admin_document_preparation_queue(integer) to authenticated;

-- Legacy upload RPCs still write the historical status column. Neutralize new
-- queue requests at the table boundary without rewriting historical records.
create function private.prevent_document_recognition() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.ocr_status in ('queued','processing') then
    new.ocr_status:='not_required';
  end if;
  if tg_table_name='booklist_documents' and tg_op='INSERT' then
    if new.kind='ocr_draft' then
      raise exception 'Automated document drafts are no longer supported. Upload a prepared document.' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.prevent_document_recognition() from public,anon,authenticated;
create trigger booklist_jobs_no_recognition before insert or update of ocr_status on public.booklist_jobs
for each row execute function private.prevent_document_recognition();
create trigger booklist_documents_no_recognition before insert or update of ocr_status on public.booklist_documents
for each row execute function private.prevent_document_recognition();
drop index if exists public.booklist_documents_ocr_queue_idx;
