-- Admin-controlled printable shipping status.
-- This is intentionally separate from the main booklist workflow stage.

alter table public.booklist_jobs
  add column if not exists printables_shipped boolean not null default false,
  add column if not exists printables_shipping_updated_at timestamptz,
  add column if not exists printables_shipping_updated_by uuid references public.profiles(id) on delete set null;

update public.booklist_jobs
set printables_shipped = true,
    printables_shipping_updated_at = coalesce(dispatched_at, stage_updated_at, updated_at)
where dispatched_at is not null
   or stage in ('dispatched', 'received', 'completed');

create or replace function public.admin_set_printables_shipping_status(
  p_job_id uuid,
  p_shipped boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.profiles;
  j public.booklist_jobs;
begin
  p := public.assert_org_admin();

  select * into j
    from public.booklist_jobs
   where id = p_job_id
     and organization_id = p.organization_id
   for update;

  if j.id is null then
    raise exception 'Booklist job not found';
  end if;

  update public.booklist_jobs
     set printables_shipped = p_shipped,
         printables_shipping_updated_at = now(),
         printables_shipping_updated_by = p.id,
         updated_at = now()
   where id = p_job_id;

  perform public.write_audit(
    'booklist.printables_shipping_status',
    'booklist_jobs',
    p_job_id,
    jsonb_build_object('printables_shipped', p_shipped),
    p.id,
    p.organization_id
  );

  return jsonb_build_object(
    'status', 'ok',
    'operation', 'admin_set_printables_shipping_status',
    'job_id', p_job_id,
    'printables_shipped', p_shipped
  );
end;
$$;

revoke execute on function public.admin_set_printables_shipping_status(uuid, boolean) from public;
revoke execute on function public.admin_set_printables_shipping_status(uuid, boolean) from anon;
grant execute on function public.admin_set_printables_shipping_status(uuid, boolean) to authenticated;
