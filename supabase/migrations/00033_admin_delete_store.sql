-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo 00033 — Admin delete store RPC.
--
-- Deletes a store and cleans up child rows (assignments, logs, leave
-- requests, supervisor scopes) before removing the store itself.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.admin_delete_store(p_store_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  actor public.profiles;
  target public.stores;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.role not in ('super_admin', 'organization_admin') or actor.account_status <> 'approved' then
    raise exception 'Not permitted';
  end if;

  select * into target from public.stores where id = p_store_id;
  if target.id is null then
    raise exception 'Store not found';
  end if;

  if actor.role = 'organization_admin' and target.organization_id <> actor.organization_id then
    raise exception 'Cross-organization access denied';
  end if;

  -- Clean up child rows
  delete from public.sales_entries se
    using public.daily_logs dl
    where se.daily_log_id = dl.id and dl.store_id = p_store_id;

  delete from public.daily_logs where store_id = p_store_id;
  delete from public.brand_ambassador_assignments where store_id = p_store_id;
  delete from public.leave_requests where store_id = p_store_id;
  delete from public.supervisor_scopes where store_id = p_store_id;

  delete from public.stores where id = p_store_id;

  perform public.write_audit(
    'store.delete',
    'stores',
    p_store_id,
    jsonb_build_object('organization_id', target.organization_id, 'name', target.name),
    auth.uid(),
    target.organization_id
  );

  return jsonb_build_object('status', 'ok', 'store_id', p_store_id);
end;
$$;

grant execute on function public.admin_delete_store(uuid) to authenticated;

commit;
