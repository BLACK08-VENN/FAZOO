-- User-supplied Pink Stuff artwork, published at a versioned public asset URL.
-- Only the logo reference changes; campaign, team and operational data stay intact.
with changed as (
 update public.organizations set logo_url='/brands/pink-stuff-20261105.webp'
 where slug='pink-stuff' and logo_url is distinct from '/brands/pink-stuff-20261105.webp'
 returning id
)
insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
select id,null,'brand.artwork_updated','organization',id,
 jsonb_build_object('asset_path','/brands/pink-stuff-20261105.webp','width',1473,'height',1068,'source','user-provided artwork')
from changed;
