-- Completion of the booklist_grade_requests schema.
--
-- The r_ multi-grade migrations added RPCs (ba_submit_grade_booklist,
-- admin_publish_grade_word, admin_grade_print_orders,
-- admin_set_grade_printables_shipping_status) that reference a set of
-- conversion-tracking and Word-publishing columns, but the ALTER TABLE that
-- introduced them was never committed with them. This brings the committed
-- migration chain back in line with the deployed schema so a fresh database
-- (supabase db reset) supports the admin Attach Word / Replace Word flow and
-- the grade print order board.

alter table public.booklist_grade_requests
  add column if not exists conversion_status public.ocr_status
    not null default 'not_required',
  add column if not exists conversion_provider text,
  add column if not exists conversion_confidence numeric(5,2),
  add column if not exists conversion_error text,
  add column if not exists conversion_started_at timestamptz,
  add column if not exists conversion_finished_at timestamptz,
  add column if not exists word_storage_bucket text not null default 'booklist-documents',
  add column if not exists word_storage_path text,
  add column if not exists word_mime_type text,
  add column if not exists word_size_bytes bigint,
  add column if not exists word_page_count integer,
  add column if not exists word_published_at timestamptz,
  add column if not exists word_published_by uuid references public.profiles(id) on delete set null,
  add column if not exists printables_shipped boolean not null default false,
  add column if not exists printables_shipping_updated_at timestamptz,
  add column if not exists printables_shipping_updated_by uuid references public.profiles(id) on delete set null;

-- Grade print order board: one row per grade request with its Word status,
-- BA and school, scoped to the caller's own organization (super admin sees
-- everything). Read-only SELECT through SECURITY DEFINER so supervisors can
-- watch the board without write access.
create or replace function public.admin_grade_print_orders(
  p_limit integer default 500
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles%rowtype;
  v_orders jsonb;
begin
  select * into v_actor from public.profiles where id = auth.uid();
  if v_actor.id is null or v_actor.account_status <> 'approved'
     or v_actor.role not in ('super_admin', 'organization_admin', 'supervisor') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb)
    into v_orders
  from (
    select
      gr.id                      as grade_request_id,
      gr.job_id,
      bj.school_id,
      s.name                     as school_name,
      s.region                   as school_region,
      gr.grade_label,
      gr.copies_requested,
      gr.copies_to_print,
      gr.due_date::text          as due_date,
      gr.source_format,
      gr.storage_path            as raw_storage_path,
      gr.mime_type               as raw_mime_type,
      gr.conversion_status,
      gr.conversion_provider,
      gr.conversion_confidence,
      gr.conversion_error,
      gr.word_storage_path,
      gr.word_mime_type,
      gr.word_published_at,
      gr.printables_shipped,
      gr.created_at,
      p.id                       as ba_id,
      p.full_name                as ba_name,
      p.agency                   as ba_agency
    from public.booklist_grade_requests gr
    join public.booklist_jobs bj on bj.id = gr.job_id
    join public.veda_schools s   on s.id = bj.school_id
    left join public.profiles p  on p.id = gr.created_by
    where (v_actor.role = 'super_admin'
           or public.can_read_org(gr.organization_id))
    order by gr.created_at desc
    limit greatest(1, least(p_limit, 500))
  ) t;

  return jsonb_build_object('status', 'ok', 'orders', v_orders);
end;
$$;

revoke all on function public.admin_grade_print_orders(integer) from public, anon;
grant execute on function public.admin_grade_print_orders(integer) to authenticated;
grant execute on function public.admin_grade_print_orders(integer) to service_role;

-- Flip the printables-shipped flag on a single grade print order. Mirrors the
-- booklist_jobs variant (admin_set_printables_shipping_status) and writes an
-- audit row with who changed it.
create or replace function public.admin_set_grade_printables_shipping_status(
  p_grade_request_id uuid,
  p_shipped boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles%rowtype;
  v_grade public.booklist_grade_requests%rowtype;
begin
  select * into v_actor from public.profiles where id = auth.uid();
  if v_actor.id is null or v_actor.account_status <> 'approved'
     or v_actor.role not in ('super_admin', 'organization_admin') then
    raise exception 'Only approved admins can update shipping status' using errcode = '42501';
  end if;

  select * into v_grade
    from public.booklist_grade_requests
   where id = p_grade_request_id
   for update;
  if v_grade.id is null then
    raise exception 'Grade print order not found' using errcode = 'P0002';
  end if;
  if v_actor.role = 'organization_admin' and v_actor.organization_id <> v_grade.organization_id then
    raise exception 'Not authorized for this organization' using errcode = '42501';
  end if;

  update public.booklist_grade_requests
     set printables_shipped = p_shipped,
         printables_shipping_updated_at = now(),
         printables_shipping_updated_by = v_actor.id,
         updated_at = now()
   where id = v_grade.id;

  perform public.write_audit(
    'booklist_grade.printables_shipping_status',
    'booklist_grade_requests',
    v_grade.id,
    jsonb_build_object('printables_shipped', p_shipped),
    v_actor.id,
    v_grade.organization_id
  );

  return jsonb_build_object(
    'status', 'ok',
    'operation', 'admin_set_grade_printables_shipping_status',
    'grade_request_id', v_grade.id,
    'printables_shipped', p_shipped
  );
end;
$$;

revoke all on function public.admin_set_grade_printables_shipping_status(uuid, boolean) from public, anon;
grant execute on function public.admin_set_grade_printables_shipping_status(uuid, boolean) to authenticated;
grant execute on function public.admin_set_grade_printables_shipping_status(uuid, boolean) to service_role;