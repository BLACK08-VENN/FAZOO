-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo — School booklist pipeline: admin / supervisor RPCs.
--
-- Covers the admin half of the flow: the conversion queue, publishing the
-- formatted Word document, raising and tracking print orders (dispatch means +
-- time + receipt), the cross-school pipeline board that answers "where is this
-- school in the process?", school master-list upkeep, BA agency assignment and
-- per-BA school targets.
--
-- Elevated mutations require super_admin / organization_admin. Supervisors get
-- read access through can_read_org() so they can watch the board without being
-- able to publish documents or dispatch orders.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── Guards ──────────────────────────────────────────────────────────────────
create or replace function public.assert_org_admin()
returns public.profiles
language plpgsql stable security definer set search_path = public as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p.account_status <> 'approved' then
    raise exception 'Your account is not approved yet (%).', p.account_status;
  end if;
  if p.role not in ('super_admin','organization_admin') then
    raise exception 'Not permitted';
  end if;
  return p;
end;
$$;

-- Read-side guard: elevated roles plus supervisors.
create or replace function public.assert_org_staff()
returns public.profiles
language plpgsql stable security definer set search_path = public as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p.account_status <> 'approved' then
    raise exception 'Your account is not approved yet (%).', p.account_status;
  end if;
  if p.role not in ('super_admin','organization_admin','supervisor') then
    raise exception 'Not permitted';
  end if;
  return p;
end;
$$;

-- ── Conversion queue ────────────────────────────────────────────────────────
-- Every job waiting on the admin (or on OCR) with its raw document attached.
create or replace function public.admin_booklist_queue(
  p_ocr_status public.ocr_status default null,
  p_limit      integer default 100
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p       public.profiles;
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
begin
  p := public.assert_org_staff();

  return jsonb_build_object(
    'status', 'ok',
    'queue', (
      select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.document_received_at nulls first, x.school_name), '[]'::jsonb)
      from (
        select bj.id                    as job_id,
               bj.stage,
               bj.ocr_status,
               bj.school_id,
               s.name                   as school_name,
               s.region                 as school_region,
               bj.document_received_at,
               bd.id                    as document_id,
               bd.storage_path,
               bd.storage_bucket,
               bd.mime_type,
               bd.file_size_bytes,
               bd.page_count,
               bd.source_format,
               bd.ocr_confidence,
               bd.ocr_error,
               bd.ocr_provider,
               ba.full_name             as ba_name,
               ba.agency                as ba_agency
          from public.booklist_jobs bj
          join public.veda_schools s on s.id = bj.school_id
          left join public.profiles ba on ba.id = bj.owner_ba_id
          left join public.booklist_documents bd
                 on bd.id = bj.raw_document_id and bd.is_current
         where bj.organization_id = p.organization_id
           and bj.stage in ('document_received','awaiting_conversion','converting')
           and (p_ocr_status is null or bj.ocr_status = p_ocr_status)
         order by bj.document_received_at nulls first, s.name
         limit v_limit
      ) x
    ),
    'counts', (
      select jsonb_build_object(
        'awaiting_conversion', count(*) filter (where bj.stage = 'awaiting_conversion'),
        'converting',          count(*) filter (where bj.stage = 'converting'),
        'ocr_failed',          count(*) filter (where bj.ocr_status = 'failed'),
        'manual_required',     count(*) filter (where bj.ocr_status = 'manual_required'),
        'formatted_ready',     count(*) filter (where bj.stage = 'formatted')
      )
      from public.booklist_jobs bj
      where bj.organization_id = p.organization_id
    )
  );
end;
$$;

-- ── Record an OCR attempt ───────────────────────────────────────────────────
-- Called by the conversion service. On success an editable draft is stored and
-- the job moves to 'converting' (admin still formats it). On failure or low
-- confidence the job is flagged manual_required and stays in the queue.
create or replace function public.admin_record_ocr_result(
  p_job_id             uuid,
  p_status             public.ocr_status,
  p_provider           text default null,
  p_confidence         numeric default null,
  p_error              text default null,
  p_draft_storage_path text default null,
  p_draft_mime_type    text default null,
  p_draft_size_bytes   bigint default null,
  p_page_count         integer default null,
  p_actor_id           uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p        public.profiles;
  v_actor  uuid := coalesce(p_actor_id, auth.uid());
  v_raw    uuid;
  v_draft  uuid;
  v_stage  public.booklist_stage;
begin
  select * into p from public.profiles where id = v_actor;
  if p.id is null or p.role not in ('super_admin','organization_admin','supervisor') then
    raise exception 'Not permitted';
  end if;

  update public.booklist_documents
     set ocr_status      = p_status,
         ocr_provider    = nullif(p_provider, ''),
         ocr_confidence  = p_confidence,
         ocr_error       = nullif(p_error, ''),
         ocr_started_at  = coalesce(ocr_started_at, now()),
         ocr_finished_at = now(),
         page_count      = coalesce(p_page_count, page_count),
         updated_at      = now()
   where id = (select raw_document_id from public.booklist_jobs where id = p_job_id)
     and kind = 'raw_upload';

  update public.booklist_jobs set ocr_status = p_status, updated_at = now()
   where id = p_job_id and organization_id = p.organization_id;

  if p_status = 'succeeded' and nullif(btrim(coalesce(p_draft_storage_path, '')), '') is not null then
    update public.booklist_documents
       set is_current = false, updated_at = now()
     where job_id = p_job_id and kind = 'ocr_draft' and is_current;

    insert into public.booklist_documents (
      organization_id, job_id, kind, storage_bucket, storage_path, mime_type,
      file_size_bytes, page_count, source_format, captured_on_site,
      uploaded_by, is_current, ocr_status, ocr_provider, ocr_confidence, ocr_finished_at
    )
    select p.organization_id, p_job_id, 'ocr_draft', 'booklist-documents',
           btrim(p_draft_storage_path), coalesce(nullif(p_draft_mime_type, ''),
             'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
           p_draft_size_bytes, p_page_count, 'ocr', false,
           v_actor, true, 'succeeded', nullif(p_provider, ''), p_confidence, now()
    returning id into v_draft;

    select stage into v_stage from public.booklist_jobs where id = p_job_id;
    if v_stage in ('document_received','awaiting_conversion') then
      perform public.set_booklist_stage(p_job_id, 'converting', v_actor,
        format('OCR draft generated by %s (confidence %s)',
               coalesce(nullif(p_provider, ''), 'unknown'),
               coalesce(p_confidence::text, 'n/a')));
    end if;
  elsif p_status in ('failed','manual_required') then
    select stage into v_stage from public.booklist_jobs where id = p_job_id;
    if v_stage in ('document_received','awaiting_conversion','converting') then
      perform public.set_booklist_stage(p_job_id, 'awaiting_conversion', v_actor,
        'OCR unavailable — manual conversion required: ' || coalesce(nullif(p_error, ''), 'low confidence'));
    end if;
  end if;

  perform public.write_audit('booklist_document.ocr_result', 'booklist_jobs', p_job_id,
    jsonb_build_object('ocr_status', p_status, 'provider', p_provider,
                       'confidence', p_confidence, 'error', p_error,
                       'draft_document_id', v_draft), v_actor, p.organization_id);

  return jsonb_build_object('status', 'ok', 'operation', 'admin_record_ocr_result',
                            'job_id', p_job_id, 'ocr_status', p_status,
                            'draft_document_id', v_draft);
end;
$$;

-- ── Publish the formatted Word document ─────────────────────────────────────
-- The admin converts and formats the list, then uploads the finished .docx.
-- This is what the BA downloads and prints.
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

  update public.booklist_documents
     set is_current = false, updated_at = now()
   where job_id = p_job_id and kind = 'formatted' and is_current;

  insert into public.booklist_documents (
    organization_id, job_id, kind, storage_bucket, storage_path, mime_type,
    file_size_bytes, page_count, source_format, captured_on_site,
    uploaded_by, is_current, ocr_status
  ) values (
    p.organization_id, p_job_id, 'formatted', 'booklist-documents', btrim(p_storage_path),
    nullif(p_mime_type, ''), p_file_size_bytes, p_page_count, 'docx', false,
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
    coalesce(nullif(p_note, ''), 'Formatted Word document published — ready for the BA to download and print'));

  return jsonb_build_object('status', 'ok', 'operation', 'admin_publish_formatted_document',
                            'job_id', p_job_id, 'document_id', v_doc,
                            'school_name', j.school_name, 'stage', 'formatted');
end;
$$;

-- ── Manual stage control ────────────────────────────────────────────────────
-- Guarded: admins cannot skip the evidence gates (copies before completion,
-- a formatted document before school approval).
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
  if p_stage in ('pending_school_approval','school_approved') and j.formatted_document_id is null then
    raise exception 'Publish the formatted document first';
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

-- ── Print orders: raise, dispatch, receive ──────────────────────────────────
create or replace function public.admin_create_print_order(
  p_job_id            uuid,
  p_quantity          integer,
  p_printer_name      text default null,
  p_reference         text default null,
  p_client_request_id uuid default null,
  p_note              text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p       public.profiles;
  prior   jsonb;
  j       record;
  v_order uuid;
  v_qty   integer;
begin
  p := public.assert_org_admin();

  select bj.*, s.name as school_name
    into j
    from public.booklist_jobs bj
    join public.veda_schools s on s.id = bj.school_id
   where bj.id = p_job_id and bj.organization_id = p.organization_id
   for update;

  if j.id is null then raise exception 'Booklist job not found'; end if;

  -- Default to the school's count + the stamped copy; admin may override.
  v_qty := coalesce(p_quantity, j.copies_to_print);
  if v_qty is null or v_qty < 1 then
    raise exception 'Enter how many copies to print';
  end if;

  if p_client_request_id is not null then
    prior := public.try_consume_receipt(p_client_request_id, 'admin_create_print_order', p);
    if prior is not null and prior->>'order_id' is not null then return prior; end if;
    if prior is not null and prior->>'status' = 'pending' then
      delete from public.operation_receipts where client_request_id = p_client_request_id;
    elsif prior is not null then return prior; end if;
  end if;

  insert into public.print_orders (
    organization_id, job_id, reference, printer_name, quantity,
    includes_stamped_copy, status, ordered_by, ordered_at, client_request_id
  ) values (
    p.organization_id, p_job_id, nullif(btrim(coalesce(p_reference, '')), ''),
    nullif(btrim(coalesce(p_printer_name, '')), ''), v_qty,
    true, 'ordered', p.id, now(), p_client_request_id
  ) returning id into v_order;

  perform public.set_booklist_stage(p_job_id, 'in_production', p.id,
    coalesce(nullif(p_note, ''), format('Print order raised for %s copies', v_qty)));

  prior := jsonb_build_object('status', 'ok', 'operation', 'admin_create_print_order',
                              'order_id', v_order, 'job_id', p_job_id,
                              'school_name', j.school_name, 'quantity', v_qty,
                              'stage', 'in_production');
  if p_client_request_id is not null then
    perform public.complete_receipt(p_client_request_id, prior);
  end if;
  return prior;
end;
$$;

-- Dispatch and receipt in one call; pass only the fields you are updating.
create or replace function public.admin_update_print_order(
  p_order_id            uuid,
  p_status              public.print_order_status default null,
  p_printer_name        text default null,
  p_reference           text default null,
  p_quantity            integer default null,
  p_dispatch_means      public.dispatch_means default null,
  p_dispatch_carrier    text default null,
  p_dispatch_tracking_ref text default null,
  p_dispatched_at       timestamptz default null,
  p_dispatch_notes      text default null,
  p_received_at         timestamptz default null,
  p_receipt_notes       text default null,
  p_cancelled_reason    text default null,
  p_client_request_id   uuid default null,
  p_note                text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p       public.profiles;
  prior   jsonb;
  o       record;
  v_means public.dispatch_means;
  v_disp  timestamptz;
  v_recv  timestamptz;
  v_status public.print_order_status;
begin
  p := public.assert_org_admin();

  if p_client_request_id is not null then
    prior := public.try_consume_receipt(p_client_request_id, 'admin_update_print_order', p);
    if prior is not null and prior->>'status' = 'ok' then return prior; end if;
    if prior is not null and prior->>'status' = 'pending' then
      delete from public.operation_receipts where client_request_id = p_client_request_id;
    elsif prior is not null then return prior; end if;
  end if;

  select po.*, bj.school_id, bj.copies_to_print, s.name as school_name
    into o
    from public.print_orders po
    join public.booklist_jobs bj on bj.id = po.job_id
    join public.veda_schools s on s.id = bj.school_id
   where po.id = p_order_id and po.organization_id = p.organization_id
   for update;

  if o.id is null then raise exception 'Print order not found'; end if;

  v_status := coalesce(p_status, o.status);
  v_means  := coalesce(p_dispatch_means, o.dispatch_means);
  v_disp   := case when v_status in ('dispatched','received')
                   then coalesce(p_dispatched_at, o.dispatched_at, now())
                   else coalesce(p_dispatched_at, o.dispatched_at) end;
  v_recv   := case when v_status = 'received'
                   then coalesce(p_received_at, o.received_at, now())
                   else coalesce(p_received_at, o.received_at) end;

  -- "Dispatch by which means" is mandatory once something has been dispatched.
  if v_disp is not null and v_means is null then
    raise exception 'Record how the copies were dispatched (courier, boda boda, fleet, …)';
  end if;
  if v_status = 'received' and v_recv is null then
    v_recv := now();
  end if;
  if v_status = 'cancelled' and nullif(btrim(coalesce(p_cancelled_reason, o.cancelled_reason, '')), '') is null then
    raise exception 'Give a reason for cancelling the print order';
  end if;

  update public.print_orders
     set status                = v_status,
         printer_name          = coalesce(nullif(btrim(coalesce(p_printer_name, '')), ''), printer_name),
         reference             = coalesce(nullif(btrim(coalesce(p_reference, '')), ''), reference),
         quantity              = coalesce(p_quantity, quantity),
         dispatch_means        = v_means,
         dispatch_carrier      = coalesce(nullif(btrim(coalesce(p_dispatch_carrier, '')), ''), dispatch_carrier),
         dispatch_tracking_ref = coalesce(nullif(btrim(coalesce(p_dispatch_tracking_ref, '')), ''), dispatch_tracking_ref),
         dispatch_notes        = coalesce(nullif(p_dispatch_notes, ''), dispatch_notes),
         dispatched_at         = v_disp,
         dispatched_by         = case when v_disp is not null and dispatched_by is null then p.id else dispatched_by end,
         production_started_at = case when v_status in ('in_production','ready','dispatched','received')
                                      then coalesce(production_started_at, now()) else production_started_at end,
         ready_at              = case when v_status in ('ready','dispatched','received')
                                      then coalesce(ready_at, now()) else ready_at end,
         received_at           = v_recv,
         received_by           = case when v_recv is not null and received_by is null then p.id else received_by end,
         receipt_notes         = coalesce(nullif(p_receipt_notes, ''), receipt_notes),
         cancelled_reason      = case when v_status = 'cancelled'
                                      then nullif(btrim(coalesce(p_cancelled_reason, '')), '') else cancelled_reason end,
         updated_at            = now()
   where id = p_order_id;

  -- Reflect order progress on the job so both dashboards stay in step.
  if v_status = 'dispatched' then
    update public.booklist_jobs set dispatched_at = coalesce(dispatched_at, v_disp), updated_at = now()
     where id = o.job_id;
    perform public.set_booklist_stage(o.job_id, 'dispatched', p.id,
      format('%s copies dispatched by %s%s', o.quantity, v_means,
             coalesce(' (' || nullif(btrim(coalesce(p_dispatch_carrier, '')), '') || ')', '')));
  elsif v_status = 'received' then
    update public.booklist_jobs
       set dispatched_at = coalesce(dispatched_at, v_disp),
           received_at   = coalesce(received_at, v_recv),
           updated_at    = now()
     where id = o.job_id;
    perform public.set_booklist_stage(o.job_id, 'received', p.id,
      format('%s copies received at the school', o.quantity));
  elsif v_status in ('ordered','in_production') then
    perform public.set_booklist_stage(o.job_id, 'in_production', p.id, nullif(p_note, ''));
  end if;

  perform public.write_audit('print_order.update', 'print_orders', p_order_id,
    jsonb_build_object('status', v_status, 'dispatch_means', v_means,
                       'dispatched_at', v_disp, 'received_at', v_recv,
                       'job_id', o.job_id, 'note', p_note), p.id, p.organization_id);

  prior := jsonb_build_object('status', 'ok', 'operation', 'admin_update_print_order',
                              'order_id', p_order_id, 'job_id', o.job_id,
                              'school_name', o.school_name, 'order_status', v_status,
                              'dispatch_means', v_means, 'dispatched_at', v_disp,
                              'received_at', v_recv);
  if p_client_request_id is not null then
    perform public.complete_receipt(p_client_request_id, prior);
  end if;
  return prior;
end;
$$;

-- ── The pipeline board ──────────────────────────────────────────────────────
-- The single list that shows where every logged school is in the process.
-- Searchable by school name; filterable by stage, region, BA and agency.
create or replace function public.admin_pipeline_board(
  p_query      text default null,
  p_stage      public.booklist_stage default null,
  p_region     text default null,
  p_ba_id      uuid default null,
  p_agency     public.ba_agency default null,
  p_from       date default null,
  p_to         date default null,
  p_limit      integer default 100,
  p_offset     integer default 0
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p       public.profiles;
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_off   integer := greatest(coalesce(p_offset, 0), 0);
  q       text := nullif(btrim(coalesce(p_query, '')), '');
  r       text := nullif(btrim(coalesce(p_region, '')), '');
  v_total integer;
begin
  p := public.assert_org_staff();

  select count(*) into v_total
    from public.booklist_jobs bj
    join public.veda_schools s on s.id = bj.school_id
    left join public.profiles ba on ba.id = bj.owner_ba_id
   where bj.organization_id = p.organization_id
     and (p_stage  is null or bj.stage = p_stage)
     and (p_ba_id  is null or bj.owner_ba_id = p_ba_id)
     and (p_agency is null or ba.agency = p_agency)
     and (r is null or upper(s.region) = upper(r))
     and (p_from is null or bj.created_at::date >= p_from)
     and (p_to   is null or bj.created_at::date <= p_to)
     and (q is null or s.name ilike '%' || q || '%'
                     or coalesce(s.region, '') ilike '%' || q || '%'
                     or coalesce(s.address, '') ilike '%' || q || '%');

  return jsonb_build_object(
    'status', 'ok',
    'total', v_total,
    'limit', v_limit,
    'offset', v_off,
    'stage_counts', (
      select coalesce(jsonb_object_agg(z.stage, z.n), '{}'::jsonb)
      from (
        select bj.stage, count(*) as n
          from public.booklist_jobs bj
         where bj.organization_id = p.organization_id
         group by bj.stage
      ) z
    ),
    'jobs', (
      select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.stage_updated_at desc), '[]'::jsonb)
      from (
        select bj.id                    as job_id,
               bj.stage,
               bj.school_id,
               s.name                   as school_name,
               s.region                 as school_region,
               s.address                as school_address,
               bj.owner_ba_id,
               ba.full_name             as owner_ba_name,
               ba.agency                as owner_ba_agency,
               bj.copies_requested,
               bj.copies_to_print,
               bj.is_per_grade,
               bj.ocr_status,
               bj.document_received_at,
               bj.formatted_at,
               bj.approved_by_school_at,
               bj.dispatched_at,
               bj.received_at,
               bj.completed_at,
               bj.stage_updated_at,
               bj.created_at,
               (bj.raw_document_id is not null)       as has_raw_document,
               (bj.formatted_document_id is not null) as has_formatted_document,
               (bj.stamped_document_id is not null)   as has_stamped_copy,
               bj.raw_document_id,
               bj.formatted_document_id,
               bj.stamped_document_id,
               (select po.status || ' · ' || coalesce(po.dispatch_means::text, 'not dispatched')
                  from public.print_orders po
                 where po.job_id = bj.id
                 order by po.created_at desc limit 1)  as latest_print_order,
               (select po.dispatch_means
                  from public.print_orders po
                 where po.job_id = bj.id and po.dispatch_means is not null
                 order by po.created_at desc limit 1)  as print_order_dispatch_means,
               (select count(*) from public.school_visits v
                 where v.school_id = bj.school_id)      as visit_count,
               (select max(v.visit_date) from public.school_visits v
                 where v.school_id = bj.school_id)      as last_visit_date
          from public.booklist_jobs bj
          join public.veda_schools s on s.id = bj.school_id
          left join public.profiles ba on ba.id = bj.owner_ba_id
         where bj.organization_id = p.organization_id
           and (p_stage  is null or bj.stage = p_stage)
           and (p_ba_id  is null or bj.owner_ba_id = p_ba_id)
           and (p_agency is null or ba.agency = p_agency)
           and (r is null or upper(s.region) = upper(r))
           and (p_from is null or bj.created_at::date >= p_from)
           and (p_to   is null or bj.created_at::date <= p_to)
           and (q is null or s.name ilike '%' || q || '%'
                           or coalesce(s.region, '') ilike '%' || q || '%'
                           or coalesce(s.address, '') ilike '%' || q || '%')
         order by bj.stage_updated_at desc
         limit v_limit offset v_off
      ) x
    )
  );
end;
$$;

-- ── School dossier ──────────────────────────────────────────────────────────
create or replace function public.admin_school_dossier(p_school_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p public.profiles;
  s record;
begin
  p := public.assert_org_staff();

  select * into s from public.veda_schools
   where id = p_school_id and organization_id = p.organization_id;
  if s.id is null then raise exception 'School not found'; end if;

  return jsonb_build_object(
    'status', 'ok',
    'school', to_jsonb(s),
    'jobs', (
      select coalesce(jsonb_agg(row_to_json(j)::jsonb order by j.created_at desc), '[]'::jsonb)
      from public.booklist_jobs j where j.school_id = p_school_id
    ),
    'visits', (
      select coalesce(jsonb_agg(row_to_json(v)::jsonb order by v.arrived_at desc), '[]'::jsonb)
      from (
        select sv.*, pr.full_name as ba_name, pr.agency as ba_agency
          from public.school_visits sv
          join public.profiles pr on pr.id = sv.brand_ambassador_id
         where sv.school_id = p_school_id
      ) v
    )
  );
end;
$$;

-- ── BA agency + targets ─────────────────────────────────────────────────────
create or replace function public.admin_set_ba_agency(
  p_ba_id  uuid,
  p_agency public.ba_agency
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p     public.profiles;
  v_old public.ba_agency;
begin
  p := public.assert_org_admin();

  select pr.agency into v_old
    from public.profiles pr
   where pr.id = p_ba_id
     and pr.organization_id = p.organization_id
     and pr.role = 'brand_ambassador';

  if not found then
    raise exception 'Brand ambassador not found in your organization';
  end if;

  update public.profiles set agency = p_agency, updated_at = now() where id = p_ba_id;

  perform public.write_audit('profile.agency', 'profiles', p_ba_id,
    jsonb_build_object('from', v_old, 'to', p_agency,
                       'selfie_required', (public.ba_visit_rules(p.organization_id, p_agency)->>'selfie_required')::boolean),
    p.id, p.organization_id);

  return jsonb_build_object('status', 'ok', 'operation', 'admin_set_ba_agency',
                            'ba_id', p_ba_id, 'agency', p_agency);
end;
$$;

create or replace function public.admin_set_ba_target(
  p_ba_id           uuid,
  p_period_start    date,
  p_period_end      date,
  p_target_schools  integer,
  p_target_id       uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p    public.profiles;
  v_id uuid;
begin
  p := public.assert_org_admin();

  if p_period_end < p_period_start then
    raise exception 'The target period must end after it starts';
  end if;
  if p_target_schools is null or p_target_schools < 0 then
    raise exception 'Target schools must be zero or more';
  end if;

  perform 1 from public.profiles pr
   where pr.id = p_ba_id and pr.organization_id = p.organization_id
     and pr.role = 'brand_ambassador';
  if not found then
    raise exception 'Brand ambassador not found in your organization';
  end if;

  if p_target_id is null then
    insert into public.ba_school_targets (
      organization_id, brand_ambassador_id, agency, period_start, period_end, target_schools, created_by
    )
    select p.organization_id, p_ba_id, pr.agency, p_period_start, p_period_end, p_target_schools, p.id
      from public.profiles pr where pr.id = p_ba_id
    on conflict (brand_ambassador_id, period_start, period_end)
    do update set target_schools = excluded.target_schools,
                  agency         = excluded.agency,
                  updated_at     = now()
    returning id into v_id;
  else
    update public.ba_school_targets
       set period_start   = p_period_start,
           period_end     = p_period_end,
           target_schools = p_target_schools,
           updated_at     = now()
     where id = p_target_id and organization_id = p.organization_id
     returning id into v_id;
    if v_id is null then raise exception 'Target not found'; end if;
  end if;

  perform public.write_audit('ba_school_target.upsert', 'ba_school_targets', v_id,
    jsonb_build_object('ba_id', p_ba_id, 'period_start', p_period_start,
                       'period_end', p_period_end, 'target_schools', p_target_schools),
    p.id, p.organization_id);

  return jsonb_build_object('status', 'ok', 'operation', 'admin_set_ba_target',
                            'target_id', v_id, 'ba_id', p_ba_id,
                            'target_schools', p_target_schools);
end;
$$;

-- ── BA performance board ────────────────────────────────────────────────────
-- Distinguishes AEL from Veda BAs, shows who requires a mandatory selfie,
-- whether they are complying, and how many schools they actually reached
-- against their target.
create or replace function public.admin_ba_performance(
  p_agency       public.ba_agency default null,
  p_period_start date default null,
  p_period_end   date default null
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p       public.profiles;
  org     public.organizations;
  v_start date;
  v_end   date;
begin
  p := public.assert_org_staff();
  select * into org from public.organizations where id = p.organization_id;

  v_end   := coalesce(p_period_end, (now() at time zone coalesce(org.timezone, 'UTC'))::date);
  v_start := coalesce(p_period_start, date_trunc('month', v_end)::date);

  return jsonb_build_object(
    'status', 'ok',
    'period_start', v_start,
    'period_end', v_end,
    'brand_ambassadors', (
      select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.agency nulls last, x.full_name), '[]'::jsonb)
      from (
        select pr.id                        as ba_id,
               pr.full_name,
               pr.phone,
               pr.agency,
               pr.account_status,
               (public.ba_visit_rules(pr.organization_id, pr.agency)->>'selfie_required')::boolean
                                            as selfie_required,
               coalesce(t.target_schools,
                 (public.ba_visit_rules(pr.organization_id, pr.agency)->'target_schools_per_month')::integer)
                                            as target_schools,
               t.period_start               as target_period_start,
               t.period_end                 as target_period_end,
               (select count(distinct v.school_id) from public.school_visits v
                 where v.brand_ambassador_id = pr.id
                   and v.visit_date between v_start and v_end)
                                            as schools_visited,
               (select count(*) from public.school_visits v
                 where v.brand_ambassador_id = pr.id
                   and v.visit_date between v_start and v_end)
                                            as visits,
               (select count(*) from public.school_visits v
                 where v.brand_ambassador_id = pr.id and v.outcome = 'booklist_offered'
                   and v.visit_date between v_start and v_end)
                                            as booklists_collected,
               (select count(*) from public.school_visits v
                 where v.brand_ambassador_id = pr.id and v.outcome = 'declined'
                   and v.visit_date between v_start and v_end)
                                            as declines,
               (select count(*) from public.school_visits v
                 where v.brand_ambassador_id = pr.id and v.selfie_required
                   and v.visit_date between v_start and v_end)
                                            as selfies_required,
               (select count(*) from public.school_visits v
                 where v.brand_ambassador_id = pr.id and v.selfie_required
                   and v.selfie_photo_path is not null
                   and v.visit_date between v_start and v_end)
                                            as selfies_captured,
               (select count(distinct v.school_id) from public.school_visits v
                 where v.brand_ambassador_id = pr.id)
                                            as schools_visited_all_time
          from public.profiles pr
          left join lateral (
                select bt.target_schools, bt.period_start, bt.period_end
                  from public.ba_school_targets bt
                 where bt.brand_ambassador_id = pr.id
                   and bt.period_start <= v_end and bt.period_end >= v_start
                 order by bt.period_start desc limit 1
               ) t on true
         where pr.organization_id = p.organization_id
           and pr.role = 'brand_ambassador'
           and pr.account_status = 'approved'
           and (p_agency is null or pr.agency = p_agency)
      ) x
    )
  );
end;
$$;

-- ── School master-list upkeep ───────────────────────────────────────────────
create or replace function public.admin_update_school(
  p_school_id               uuid,
  p_name                    text default null,
  p_region                  text default null,
  p_address                 text default null,
  p_latitude                double precision default null,
  p_longitude               double precision default null,
  p_geofence_radius_metres  integer default null,
  p_school_type             text default null,
  p_contact_person_name     text default null,
  p_contact_person_designation text default null,
  p_contact_person_phone    text default null,
  p_status                  public.store_status default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  s record;
begin
  p := public.assert_org_admin();

  select * into s from public.veda_schools
   where id = p_school_id and organization_id = p.organization_id
   for update;
  if s.id is null then raise exception 'School not found'; end if;

  if p_latitude is not null and (p_latitude not between -90 and 90) then
    raise exception 'Latitude is out of range';
  end if;
  if p_longitude is not null and (p_longitude not between -180 and 180) then
    raise exception 'Longitude is out of range';
  end if;
  if p_geofence_radius_metres is not null and p_geofence_radius_metres not between 20 and 2000 then
    raise exception 'Geofence radius must be between 20 and 2000 metres';
  end if;

  update public.veda_schools
     set name                       = coalesce(nullif(btrim(p_name), ''), name),
         region                     = coalesce(nullif(upper(btrim(p_region)), ''), region),
         address                    = coalesce(nullif(btrim(p_address), ''), address),
         latitude                   = coalesce(p_latitude, latitude),
         longitude                  = coalesce(p_longitude, longitude),
         geofence_radius_metres     = coalesce(p_geofence_radius_metres, geofence_radius_metres),
         school_type                = coalesce(nullif(btrim(p_school_type), ''), school_type),
         contact_person_name        = coalesce(nullif(btrim(p_contact_person_name), ''), contact_person_name),
         contact_person_designation = coalesce(nullif(btrim(p_contact_person_designation), ''), contact_person_designation),
         contact_person_phone       = coalesce(nullif(btrim(p_contact_person_phone), ''), contact_person_phone),
         status                     = coalesce(p_status, status),
         updated_at                 = now()
   where id = p_school_id;

  perform public.write_audit('veda_school.update', 'veda_schools', p_school_id,
    jsonb_build_object('name', p_name, 'region', p_region, 'latitude', p_latitude,
                       'longitude', p_longitude, 'status', p_status), p.id, p.organization_id);

  return jsonb_build_object('status', 'ok', 'operation', 'admin_update_school', 'school_id', p_school_id);
end;
$$;

-- ── Grants ──────────────────────────────────────────────────────────────────
grant execute on function public.admin_booklist_queue(public.ocr_status, integer) to authenticated;
grant execute on function public.admin_record_ocr_result(uuid, public.ocr_status, text, numeric, text, text, text, bigint, integer, uuid) to authenticated;
grant execute on function public.admin_publish_formatted_document(uuid, text, text, bigint, integer, boolean, text) to authenticated;
grant execute on function public.admin_advance_stage(uuid, public.booklist_stage, text) to authenticated;
grant execute on function public.admin_create_print_order(uuid, integer, text, text, uuid, text) to authenticated;
grant execute on function public.admin_update_print_order(uuid, public.print_order_status, text, text, integer, public.dispatch_means, text, text, timestamptz, text, timestamptz, text, text, uuid, text) to authenticated;
grant execute on function public.admin_pipeline_board(text, public.booklist_stage, text, uuid, public.ba_agency, date, date, integer, integer) to authenticated;
grant execute on function public.admin_school_dossier(uuid) to authenticated;
grant execute on function public.admin_set_ba_agency(uuid, public.ba_agency) to authenticated;
grant execute on function public.admin_set_ba_target(uuid, date, date, integer, uuid) to authenticated;
grant execute on function public.admin_ba_performance(public.ba_agency, date, date) to authenticated;
grant execute on function public.admin_update_school(uuid, text, text, text, double precision, double precision, integer, text, text, text, text, public.store_status) to authenticated;

revoke execute on function public.assert_org_admin() from public, anon;
revoke execute on function public.assert_org_staff() from public, anon;

commit;
