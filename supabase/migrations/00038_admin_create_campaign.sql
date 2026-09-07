-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo 00038 — Admin create campaign RPC.
--
-- Creates a campaign for a given brand (organization). Super admins may pick
-- any brand; org admins may only create within their own brand. Org is derived
-- server-side and every creation is audit-logged.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.admin_create_campaign(
  p_organization_id uuid,
  p_name text,
  p_description text default null,
  p_start_date date default null,
  p_end_date date default null,
  p_status text default 'active'
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  actor       public.profiles;
  v_org       public.organizations;
  v_status    public.campaign_status;
  v_start     date;
  v_campaign  public.campaigns;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.role not in ('super_admin', 'organization_admin') or actor.account_status <> 'approved' then
    raise exception 'Not permitted';
  end if;

  if p_organization_id is null then
    raise exception 'A brand is required';
  end if;

  select * into v_org from public.organizations where id = p_organization_id;
  if v_org.id is null then
    raise exception 'Brand not found';
  end if;

  if actor.role = 'organization_admin' and v_org.id <> actor.organization_id then
    raise exception 'Cross-organization access denied';
  end if;

  if trim(p_name) is null or length(trim(p_name)) < 2 then
    raise exception 'Campaign name is required';
  end if;

  begin
    v_status := p_status::public.campaign_status;
  exception when others then
    raise exception 'Invalid campaign status';
  end;

  v_start := coalesce(p_start_date, CURRENT_DATE);

  insert into public.campaigns
    (organization_id, name, description, start_date, end_date, status, created_at, updated_at)
  values
    (v_org.id, trim(p_name), nullif(trim(coalesce(p_description, '')), ''), v_start, p_end_date, v_status, now(), now())
  returning * into v_campaign;

  perform public.write_audit(
    'campaign.create',
    'campaigns',
    v_campaign.id,
    jsonb_build_object('organization_id', v_org.id, 'name', v_campaign.name, 'status', v_status),
    auth.uid(),
    v_org.id
  );

  return jsonb_build_object('status', 'ok', 'campaign_id', v_campaign.id, 'organization_id', v_org.id);
end;
$$;

grant execute on function public.admin_create_campaign(uuid, text, text, date, date, text) to authenticated;

commit;
