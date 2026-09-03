-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo 00027 — Rename the Veda "demo" campaign.
--
-- The Veda campaign was created via the admin portal with the name
-- "Veda (DEMO)". Normalise it to "Veda". Scoped strictly to campaigns that
-- belong to the Veda organization (slug 'veda') so no other org is affected.
-- ═══════════════════════════════════════════════════════════════════════════

update public.campaigns c
   set name = 'Veda',
       updated_at = now()
  from public.organizations o
 where o.id = c.organization_id
   and o.slug = 'veda'
   and c.name ilike 'Veda (DEMO)%';
