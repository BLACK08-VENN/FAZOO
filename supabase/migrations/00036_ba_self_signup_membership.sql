-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo 00036 — BA self sign-up creates a pending organization membership.
--
-- The original handle_new_user() trigger created only a `profiles` row, so a
-- self-registered BA never got an organization_memberships row and never
-- appeared in the admin's pending-approval queue. This redefines the trigger
-- to also insert the pending membership and point the profile at it.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select id into v_org
  from public.organizations
  where slug = coalesce(nullif(new.raw_user_meta_data->>'organization_slug', ''), 'lenovo-nigeria')
  limit 1;

  insert into public.profiles (id, organization_id, full_name, phone, role, account_status)
  values (
    new.id,
    v_org,
    coalesce(new.raw_user_meta_data->>'full_name', 'Unnamed User'),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    'brand_ambassador',
    'pending'
  );

  insert into public.organization_memberships
    (user_id, organization_id, role, account_status)
  values (
    new.id,
    v_org,
    'brand_ambassador',
    'pending'
  )
  on conflict (user_id, organization_id) do nothing;

  update public.profiles
  set current_membership_id = (
    select m.id from public.organization_memberships m
    where m.user_id = new.id and m.organization_id = v_org
    limit 1
  )
  where id = new.id;

  return new;
end;
$$;

commit;
