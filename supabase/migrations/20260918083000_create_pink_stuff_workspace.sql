-- Pink Stuff is a standalone retail workspace, not a Veda campaign.
-- Abort instead of deleting if any mistaken Veda record has acquired activity.
do $$
begin
  if exists (
    select 1
      from public.campaigns c
      join public.organizations o on o.id = c.organization_id
     where lower(o.name) = 'veda'
       and lower(c.name) = 'pink stuff'
       and (
         exists (select 1 from public.brand_ambassador_assignments x where x.campaign_id = c.id)
         or exists (select 1 from public.daily_logs x where x.campaign_id = c.id)
         or exists (select 1 from public.skus x where x.campaign_id = c.id)
         or exists (select 1 from public.campaign_unlocks x where x.campaign_id = c.id)
         or exists (select 1 from public.supervisor_scopes x where x.campaign_id = c.id)
       )
  ) then
    raise exception 'Cannot move Pink Stuff: a Veda campaign already has activity';
  end if;
end;
$$;

delete from public.campaigns c
using public.organizations o
where c.organization_id = o.id
  and lower(o.name) = 'veda'
  and lower(c.name) = 'pink stuff';

insert into public.organizations (
  name,
  slug,
  logo_url,
  primary_color,
  secondary_color,
  timezone,
  status,
  has_code_gate,
  access_code,
  kind
)
values (
  'Pink Stuff',
  'pink-stuff',
  '/brands/pink-stuff.png',
  '#E91E63',
  '#FCE4EC',
  'Africa/Nairobi',
  'active',
  true,
  upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  'retail'
)
on conflict (slug) do update
set
  logo_url = excluded.logo_url,
  primary_color = excluded.primary_color,
  secondary_color = excluded.secondary_color,
  timezone = excluded.timezone,
  status = 'active',
  kind = 'retail';

insert into public.campaigns (
  organization_id,
  name,
  description,
  start_date,
  end_date,
  status,
  access_code
)
select
  o.id,
  'PINK STUFF',
  'Pink Stuff brand activation campaign',
  date '2026-09-21',
  null,
  'active',
  o.access_code
from public.organizations o
where o.slug = 'pink-stuff'
  and not exists (
    select 1
      from public.campaigns c
     where c.organization_id = o.id
       and lower(c.name) = 'pink stuff'
  );
