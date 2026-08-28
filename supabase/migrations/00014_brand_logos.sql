-- Fazoo 00014 — configure tenant logos and expose them to the brand picker.

update public.organizations
set logo_url = '/brands/lenovo.png'
where slug = 'lenovo-nigeria';

update public.organizations
set logo_url = '/brands/veda.jpeg'
where slug = 'veda';

drop function if exists public.my_memberships();

create function public.my_memberships()
returns table (
  organization_id uuid,
  organization_slug text,
  organization_name text,
  logo_url text,
  role app_role,
  account_status account_status,
  has_code_gate boolean
)
language sql stable security definer set search_path = public as $$
  select m.organization_id, o.slug, o.name, o.logo_url,
         m.role, m.account_status, o.has_code_gate
  from public.organization_memberships m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = auth.uid()
  order by o.name;
$$;

grant execute on function public.my_memberships() to authenticated;

drop function if exists public.joinable_brands();

create function public.joinable_brands()
returns table (
  organization_id uuid,
  organization_slug text,
  organization_name text,
  logo_url text,
  has_code_gate boolean
)
language sql stable security definer set search_path = public as $$
  select o.id, o.slug, o.name, o.logo_url, o.has_code_gate
  from public.organizations o
  where o.status = 'active'
  order by o.name;
$$;

grant execute on function public.joinable_brands() to anon, authenticated;
