-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo 00035 — Admin delete organization (brand) RPC.
--
-- Deletes an entire organization and all its children: campaigns, stores,
-- SKUs, assignments, daily_logs, sales_entries, supervisor_scopes,
-- leave_requests, veda data, and the brand admin membership. Hard-deletes
-- the org itself (organization_memberships cascades via FK).
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.admin_delete_organization(p_org_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  actor public.profiles;
  target public.organizations;
  v_name text;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.role <> 'super_admin' or actor.account_status <> 'approved' then
    raise exception 'Only super admins can delete brands';
  end if;

  select * into target from public.organizations where id = p_org_id;
  if target.id is null then
    raise exception 'Brand not found';
  end if;

  v_name := target.name;

  -- sales_entries (via daily_logs chain)
  delete from public.sales_entries se
    using public.daily_logs dl
    where se.daily_log_id = dl.id and dl.organization_id = p_org_id;

  -- daily_logs
  delete from public.daily_logs where organization_id = p_org_id;

  -- brand_ambassador_assignments
  delete from public.brand_ambassador_assignments where organization_id = p_org_id;

  -- leave_requests
  delete from public.leave_requests where organization_id = p_org_id;

  -- supervisor_scopes
  delete from public.supervisor_scopes where organization_id = p_org_id;

  -- campaign_unlocks
  delete from public.campaign_unlocks cu
    using public.campaigns c
    where cu.campaign_id = c.id and c.organization_id = p_org_id;

  -- SKUs
  delete from public.skus where organization_id = p_org_id;

  -- campaigns
  delete from public.campaigns where organization_id = p_org_id;

  -- stores
  delete from public.stores where organization_id = p_org_id;

  -- veda data
  delete from public.veda_sessions where organization_id = p_org_id;
  delete from public.veda_schools where organization_id = p_org_id;
  delete from public.veda_stationery_items where organization_id = p_org_id;

  -- organization_memberships (cascades via FK)
  delete from public.organization_memberships where organization_id = p_org_id;

  -- profiles scoped to this org
  delete from public.profiles where organization_id = p_org_id;

  -- the org itself
  delete from public.organizations where id = p_org_id;

  perform public.write_audit(
    'organization.delete',
    'organizations',
    p_org_id,
    jsonb_build_object('name', v_name),
    auth.uid(),
    p_org_id
  );

  return jsonb_build_object('status', 'ok', 'organization_id', p_org_id);
end;
$$;

grant execute on function public.admin_delete_organization(uuid) to authenticated;

commit;
