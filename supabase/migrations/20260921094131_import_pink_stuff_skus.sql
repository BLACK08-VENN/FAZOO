-- Import the supplied Pink Stuff catalogue into its standalone retail campaign.
-- Codes are GTINs from the campaign CSV and are kept as text to preserve them
-- exactly. Re-running this migration is safe: existing campaign codes are
-- refreshed and reactivated instead of duplicated.
do $$
begin
  if not exists (
    select 1
    from public.campaigns c
    join public.organizations o on o.id = c.organization_id
    where o.slug = 'pink-stuff'
      and lower(c.name) = 'pink stuff'
  ) then
    raise exception 'Pink Stuff campaign not found';
  end if;
end;
$$;

with catalogue(code, name) as (
  values
    ('5060033821114', 'STARDROPS PINK STUFF CLEANING PASTE 850G'),
    ('5060033823903', 'THE PINK STUFF PASTE AND SQUEEZY KIT 850G'),
    ('5060033823675', 'STARDROPS PINK STUFF CREAM CLEANER 500ML'),
    ('5060033823682', 'TPS MULTI-PURPOSE CLEANER 750ML'),
    ('5060033820759', 'TPS GLASS CLEANER ROSE VINEGAR 750ML'),
    ('5060033820681', 'STARDROPS PINK STUFF TOILET GEL 750ML'),
    ('5060033820117', 'STARDROPS PINK STUFF BATHROOM CLEANER 750ML'),
    ('5060033821138', 'STARDROPS PINK STUFF WASH UP SPRAY 500ML'),
    ('5060033821527', 'PINK STUFF ALL PURPOSE CLEANER 1L'),
    ('5060033821664', 'STARDROPS TPS FOAMING TOILET CLEANER 300G'),
    ('5060033823927', 'THE PINK STUFF WINDOW CLEANING KIT 850ML'),
    ('5060033820162', 'STARDROPS PINK STUFF STAIN POWDER WHITES 1KG'),
    ('5060033820148', 'STARDROPS PINK STUFF STAIN POWDER COLOUR 1KG'),
    ('5060033820841', 'STARDROPS PINK STUFF DETERGENT NON BIO 960ML'),
    ('5060033820186', 'STARDROPS PINK STUFF STAIN REMOVER SPRAY'),
    ('5060033822784', 'TPS MIRACLE FOAMING CARPET & UPHOLSTERY'),
    ('5060033823965', 'STARDROPS PINK STUFF MULTIPURPOSE WIPES L72P'),
    ('5060033823989', 'STARDROPS PINK STUFF FLOOR WIPES L20P'),
    ('5060033823507', 'THE PINK STUFF MICROFIBRE PADS 3PACK')
), pink_stuff_campaign as (
  select c.id as campaign_id, c.organization_id
  from public.campaigns c
  join public.organizations o on o.id = c.organization_id
  where o.slug = 'pink-stuff'
    and lower(c.name) = 'pink stuff'
)
insert into public.skus (
  organization_id,
  campaign_id,
  name,
  code,
  status
)
select
  p.organization_id,
  p.campaign_id,
  catalogue.name,
  catalogue.code,
  'active'::public.sku_status
from catalogue
cross join pink_stuff_campaign p
on conflict (campaign_id, code) do update
set
  organization_id = excluded.organization_id,
  name = excluded.name,
  status = 'active'::public.sku_status,
  updated_at = now();
