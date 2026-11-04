-- The admin landing page is a neutral brand directory. Organization-scoped
-- operations are entered explicitly through the guarded workspace action.
create function private.admin_hub_actor() returns public.profiles
language plpgsql stable security definer set search_path='' as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id=auth.uid() and account_status='approved' and role in ('super_admin','organization_admin','supervisor');
  if p.id is null then raise exception 'Approved staff access required' using errcode='42501'; end if;
  if p.current_membership_id is not null and not exists(select 1 from public.organization_memberships m where m.id=p.current_membership_id and m.user_id=p.id and m.organization_id=p.organization_id and m.role=p.role and m.account_status='approved') then
    raise exception 'Your staff membership is no longer active' using errcode='42501';
  end if;
  return p;
end $$;
revoke all on function private.admin_hub_actor() from public,anon,authenticated;

create function public.admin_brand_hub() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.profiles; result jsonb;
begin
  p:=private.admin_hub_actor();
  with available as (
    select o.id,o.name,o.slug,o.logo_url,o.kind,o.status
    from public.organizations o where o.status='active' and (
      p.role='super_admin' or o.id=p.organization_id or exists(
        select 1 from public.organization_memberships m where m.user_id=p.id and m.organization_id=o.id
        and m.account_status='approved' and m.role in ('super_admin','organization_admin','supervisor')
      )
    )
  ), brands as (
    select a.*,
      (select count(*) from public.campaigns c where c.organization_id=a.id and c.status='active') as active_campaigns,
      (select count(*) from public.campaigns c where c.organization_id=a.id) as total_campaigns
    from available a
  )
  select jsonb_build_object(
    'brands',(select coalesce(jsonb_agg(to_jsonb(b) order by b.name),'[]'::jsonb) from brands b),
    'active_brands',(select count(*) from available),
    'active_campaigns',(select coalesce(sum(active_campaigns),0) from brands),
    'team_members',(select count(*) from public.profiles pr where pr.organization_id in(select id from available) and pr.account_status='approved' and pr.role<>'client'),
    'pending_approvals',(select count(*) from public.organization_memberships m where m.organization_id in(select id from available) and m.account_status='pending')
  ) into result;
  return result;
end $$;
revoke all on function public.admin_brand_hub() from public,anon;
grant execute on function public.admin_brand_hub() to authenticated;

create function public.admin_open_brand(p_organization_id uuid,p_client_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.profiles; target public.organizations; membership public.organization_memberships; receipt public.operation_receipts; result jsonb; previous_sync text;
begin
  perform 1 from public.profiles where id=auth.uid() for update;
  p:=private.admin_hub_actor();
  if p_organization_id is null or p_client_request_id is null then raise exception 'Choose an active brand'; end if;
  select * into target from public.organizations where id=p_organization_id and status='active' for share;
  if target.id is null then raise exception 'This brand is not active' using errcode='42501'; end if;
  if p.role<>'super_admin' and p.organization_id<>target.id then
    select * into membership from public.organization_memberships where user_id=p.id and organization_id=target.id
      and account_status='approved' and role in ('super_admin','organization_admin','supervisor') limit 1 for share;
    if membership.id is null then raise exception 'This brand is not assigned to your staff account' using errcode='42501'; end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_client_request_id::text,0));
  select * into receipt from public.operation_receipts where client_request_id=p_client_request_id;
  if found then
    if receipt.brand_ambassador_id<>p.id or receipt.operation<>'admin_open_brand' or receipt.result->>'organization_id'<>target.id::text then raise exception 'Request ID is already in use' using errcode='42501'; end if;
    -- A stale retry must never silently reopen a workspace after another switch.
    if p.organization_id<>target.id then raise exception 'Brand selection changed. Open the brand again.'; end if;
    return receipt.result;
  end if;
  if not public.check_rate_limit('admin-open-brand:'||p.id::text,60,300) then raise exception 'Too many brand switches. Please try again shortly.'; end if;
  if p.organization_id<>target.id then
    -- This RPC has verified the actor and target membership. Use the existing
    -- trusted membership-sync path, restoring its transaction-local flag after
    -- the update; older profile triggers can still carry the paused MFA rule.
    previous_sync:=current_setting('fazoo.membership_sync',true);
    perform set_config('fazoo.membership_sync','true',true);
    if p.role='super_admin' then
      update public.profiles set organization_id=target.id,current_membership_id=null where id=p.id;
    else
      update public.profiles set organization_id=target.id,current_membership_id=membership.id,role=membership.role,account_status=membership.account_status where id=p.id;
    end if;
    perform set_config('fazoo.membership_sync',coalesce(previous_sync,''),true);
  end if;
  result:=jsonb_build_object('organization_id',target.id,'name',target.name,'kind',target.kind,'slug',target.slug);
  insert into public.operation_receipts(organization_id,brand_ambassador_id,client_request_id,operation,result)
    values(target.id,p.id,p_client_request_id,'admin_open_brand',result);
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
    values(target.id,p.id,'admin.brand_opened','organization',target.id,jsonb_build_object('previous_organization_id',p.organization_id));
  return result;
end $$;
revoke all on function public.admin_open_brand(uuid,uuid) from public,anon;
grant execute on function public.admin_open_brand(uuid,uuid) to authenticated;
