-- Ensure the standalone Pink Stuff workspace uses the exact supplied brand logo
-- everywhere the active organization is rendered in the admin/BA interfaces.
update public.organizations
set
  logo_url = '/brands/pink-stuff.png',
  status = 'active',
  kind = 'retail'
where slug = 'pink-stuff';
