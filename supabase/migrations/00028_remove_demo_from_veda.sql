-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo 00028 — Remove "(Demo)" from the Veda brand and its campaign names.
--
-- The earlier 00027 migration renamed nothing because the live rows are named
-- "Veda Retail Drive (Demo)" (campaign) and "Veda (Demo)" (organization), not
-- the "Veda (DEMO)" that migration assumed. This migration normalises the
-- Veda brand and its campaigns, scoped strictly to the Veda organization
-- (slug 'veda') so no other org is affected.
-- ═══════════════════════════════════════════════════════════════════════════

-- Brand / organization name.
update public.organizations
   set name = 'Veda',
       updated_at = now()
 where slug = 'veda'
   and name ilike 'Veda (%demo%)';

-- Campaigns owned by the Veda organization. Strip a trailing " (Demo)" suffix.
update public.campaigns c
   set name = regexp_replace(c.name, ' \((demo)\)$', '', 'i'),
       updated_at = now()
  from public.organizations o
 where o.id = c.organization_id
   and o.slug = 'veda'
   and c.name ilike '%(demo)%';
