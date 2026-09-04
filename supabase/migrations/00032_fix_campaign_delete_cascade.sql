-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo 00032 — Fix campaign delete to clean up child rows first.
--
-- The original RPC hit RESTRICT FKs on skus, assignments, daily_logs and
-- supervisor_scopes. This replaces the function to delete children in the
-- correct order before removing the campaign itself.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.admin_delete_campaign(p_campaign_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  actor public.profiles;
  target public.campaigns;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.role not in ('super_admin', 'organization_admin') or actor.account_status <> 'approved' then
    raise exception 'Not permitted';
  end if;

  select * into target from public.campaigns where id = p_campaign_id;
  if target.id is null then
    raise exception 'Campaign not found';
  end if;

  if actor.role = 'organization_admin' and target.organization_id <> actor.organization_id then
    raise exception 'Cross-organization access denied';
  end if;

  -- Clean up child rows (order respects FK chains)
  delete from public.sales_entries se
    using public.daily_logs dl
    where se.daily_log_id = dl.id and dl.campaign_id = p_campaign_id;

  delete from public.daily_logs where campaign_id = p_campaign_id;
  delete from public.brand_ambassador_assignments where campaign_id = p_campaign_id;
  delete from public.skus where campaign_id = p_campaign_id;
  delete from public.supervisor_scopes where campaign_id = p_campaign_id;
  delete from public.campaign_unlocks where campaign_id = p_campaign_id;

  delete from public.campaigns where id = p_campaign_id;

  perform public.write_audit(
    'campaign.delete',
    'campaigns',
    p_campaign_id,
    jsonb_build_object('organization_id', target.organization_id, 'name', target.name),
    auth.uid(),
    target.organization_id
  );

  return jsonb_build_object('status', 'ok', 'campaign_id', p_campaign_id);
end;
$$;

grant execute on function public.admin_delete_campaign(uuid) to authenticated;

commit;
