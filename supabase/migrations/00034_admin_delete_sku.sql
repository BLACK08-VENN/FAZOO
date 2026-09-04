-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo 00034 — Admin delete SKU RPC.
--
-- Deletes a SKU and cleans up sales_entries before removing the SKU.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.admin_delete_sku(p_sku_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  actor public.profiles;
  target public.skus;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.role not in ('super_admin', 'organization_admin') or actor.account_status <> 'approved' then
    raise exception 'Not permitted';
  end if;

  select * into target from public.skus where id = p_sku_id;
  if target.id is null then
    raise exception 'SKU not found';
  end if;

  if actor.role = 'organization_admin' and target.organization_id <> actor.organization_id then
    raise exception 'Cross-organization access denied';
  end if;

  -- Clean up child rows
  delete from public.sales_entries where sku_id = p_sku_id;

  delete from public.skus where id = p_sku_id;

  perform public.write_audit(
    'sku.delete',
    'skus',
    p_sku_id,
    jsonb_build_object('organization_id', target.organization_id, 'name', target.name, 'code', target.code),
    auth.uid(),
    target.organization_id
  );

  return jsonb_build_object('status', 'ok', 'sku_id', p_sku_id);
end;
$$;

grant execute on function public.admin_delete_sku(uuid) to authenticated;

commit;
