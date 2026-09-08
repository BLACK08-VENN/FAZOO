-- Show BAs only their memberships in brands that currently run a campaign,
-- and derive access from active admin-created assignments. The switch RPC
-- repeats the assignment check so access cannot be bypassed from the client.

create or replace function public.ba_brand_options()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  actor_id   uuid := auth.uid();
  lagos_date date := (now() at time zone 'Africa/Lagos')::date;
  result     jsonb;
begin
  if actor_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(option_row order by option_row->>'organization_name'), '[]'::jsonb)
    into result
  from (
    select jsonb_build_object(
      'organization_id', o.id,
      'organization_slug', o.slug,
      'organization_name', o.name,
      'logo_url', o.logo_url,
      'role', m.role,
      'account_status', m.account_status,
      'has_code_gate', o.has_code_gate,
      'kind', o.kind,
      'assigned', (
        exists (
          select 1
          from public.brand_ambassador_assignments assignment
          join public.campaigns assigned_campaign on assigned_campaign.id = assignment.campaign_id
          where assignment.brand_ambassador_id = actor_id
            and assignment.organization_id = o.id
            and assignment.status = 'active'
            and assignment.start_date <= lagos_date
            and (assignment.end_date is null or assignment.end_date >= lagos_date)
            and assigned_campaign.status = 'active'
            and assigned_campaign.start_date <= lagos_date
            and (assigned_campaign.end_date is null or assigned_campaign.end_date >= lagos_date)
        )
        or exists (
          select 1
          from public.veda_assignments assignment
          where assignment.brand_ambassador_id = actor_id
            and assignment.organization_id = o.id
            and assignment.status = 'active'
            and assignment.start_date <= lagos_date
            and (assignment.end_date is null or assignment.end_date >= lagos_date)
        )
      )
    ) option_row
    from public.organization_memberships m
    join public.organizations o on o.id = m.organization_id
    where m.user_id = actor_id
      and o.status = 'active'
      and exists (
        select 1
        from public.campaigns campaign
        where campaign.organization_id = o.id
          and campaign.status = 'active'
          and campaign.start_date <= lagos_date
          and (campaign.end_date is null or campaign.end_date >= lagos_date)
      )
  ) options;

  return result;
end;
$$;

create or replace function public.ba_switch_brand(p_organization_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  actor_id   uuid := auth.uid();
  lagos_date date := (now() at time zone 'Africa/Lagos')::date;
  membership public.organization_memberships;
  has_assignment boolean;
begin
  if actor_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select m.* into membership
  from public.organization_memberships m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = actor_id
    and m.organization_id = p_organization_id
    and m.role = 'brand_ambassador'
    and m.account_status = 'approved'
    and o.status = 'active';

  if membership.id is null then
    raise exception 'You do not have an approved membership for this brand.' using errcode = '42501';
  end if;

  select
    exists (
      select 1
      from public.brand_ambassador_assignments assignment
      join public.campaigns campaign on campaign.id = assignment.campaign_id
      where assignment.brand_ambassador_id = actor_id
        and assignment.organization_id = p_organization_id
        and assignment.status = 'active'
        and assignment.start_date <= lagos_date
        and (assignment.end_date is null or assignment.end_date >= lagos_date)
        and campaign.status = 'active'
        and campaign.start_date <= lagos_date
        and (campaign.end_date is null or campaign.end_date >= lagos_date)
    )
    or (
      exists (
        select 1
        from public.veda_assignments assignment
        where assignment.brand_ambassador_id = actor_id
          and assignment.organization_id = p_organization_id
          and assignment.status = 'active'
          and assignment.start_date <= lagos_date
          and (assignment.end_date is null or assignment.end_date >= lagos_date)
      )
      and exists (
        select 1
        from public.campaigns campaign
        where campaign.organization_id = p_organization_id
          and campaign.status = 'active'
          and campaign.start_date <= lagos_date
          and (campaign.end_date is null or campaign.end_date >= lagos_date)
      )
    )
  into has_assignment;

  if not has_assignment then
    raise exception 'You have not been assigned to an active campaign for this brand.' using errcode = '42501';
  end if;

  update public.profiles
     set organization_id = membership.organization_id,
         role = membership.role,
         account_status = membership.account_status,
         current_membership_id = membership.id
   where id = actor_id;

  return p_organization_id;
end;
$$;

revoke all on function public.ba_brand_options() from public;
revoke all on function public.ba_switch_brand(uuid) from public;
grant execute on function public.ba_brand_options(), public.ba_switch_brand(uuid) to authenticated;
