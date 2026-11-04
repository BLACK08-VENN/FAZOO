-- Partner collection follows the paused-authenticator workflow already shipped
-- in 20261006132510. Do not re-enable MFA through a stale shared helper.
-- Approval, role, active organization and tenant checks remain authoritative.
create or replace function private.partner_profile() returns public.profiles
language plpgsql stable security definer set search_path='' as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id=auth.uid();
  if p.id is null or p.account_status <> 'approved' or p.role not in ('brand_ambassador','organization_admin','super_admin') then
    raise exception 'Approved Lenovo collection access required' using errcode='42501';
  end if;
  if not exists(select 1 from public.organizations where id=p.organization_id and slug='lenovo-nigeria' and status='active') then
    raise exception 'Partner collection is available in Lenovo Nigeria only' using errcode='42501';
  end if;
  return p;
end $$;
revoke all on function private.partner_profile() from public,anon,authenticated;

create function public.partner_context() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.profiles; hi integer; med integer;
begin
  p:=private.partner_profile();
  select high_threshold,medium_threshold into hi,med from public.partner_collection_settings where organization_id=p.organization_id;
  return jsonb_build_object('organization_id',p.organization_id,'collector_name',p.full_name,'high',coalesce(hi,100),'medium',coalesce(med,30));
end $$;
revoke all on function public.partner_context() from public,anon;
grant execute on function public.partner_context() to authenticated;
