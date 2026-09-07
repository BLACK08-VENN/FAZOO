-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo 00037 — Admin pause / resume a brand (organization) RPC.
--
-- Lets a super admin flip a brand's status between 'active' and 'suspended'
-- ("pause" / "resume") and records an audit trail. RPC-only so the org id is
-- never trusted from the client; the caller's role is derived server-side.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.admin_set_organization_status(p_org_id uuid, p_status text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  actor   public.profiles;
  target  public.organizations;
  new_status public.organization_status;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.role <> 'super_admin' or actor.account_status <> 'approved' then
    raise exception 'Only super admins can pause or resume brands';
  end if;

  select * into target from public.organizations where id = p_org_id;
  if target.id is null then
    raise exception 'Brand not found';
  end if;

  begin
    new_status := p_status::public.organization_status;
  exception when others then
    raise exception 'Invalid status. Use "active" or "suspended".';
  end;

  if new_status = target.status then
    return jsonb_build_object('status', 'ok', 'organization_id', p_org_id, 'unchanged', true);
  end if;

  update public.organizations
     set status = new_status, updated_at = now()
   where id = p_org_id;

  perform public.write_audit(
    'organization.' || new_status,
    'organizations',
    p_org_id,
    jsonb_build_object('name', target.name, 'previous_status', target.status, 'new_status', new_status),
    auth.uid(),
    p_org_id
  );

  return jsonb_build_object('status', 'ok', 'organization_id', p_org_id, 'new_status', new_status);
end;
$$;

grant execute on function public.admin_set_organization_status(uuid, text) to authenticated;

commit;
