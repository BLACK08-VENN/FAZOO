-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo seed — LOCAL DEVELOPMENT ONLY.
--
-- All names are fictitious. No historical or personal data.
-- Demo passwords use pgcrypto bcrypt; they exist only for local stacks and
-- must never be reused anywhere real.
--
--   role              email alias (sign-in phone)      password
--   ────────────────  ───────────────────────────────  ───────────────
--   super admin       +23480000000001@ba.fazoo.app     Demo-Super1!
--   org admin         +23480000000002@ba.fazoo.app     Demo-Admin1!
--   supervisor        +23480000000003@ba.fazoo.app     Demo-SuperV1!
--   BA 1–3            +23480000000010..12@ba…          Demo-Ba#001!
--   client            +23480000000020@ba.fazoo.app     Demo-Client1!
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── organizations ─────────────────────────────────────────────────────────────
insert into public.organizations (id, name, slug, logo_url, timezone, primary_color, secondary_color, has_code_gate, access_code)
values (
  '11111111-1111-4111-8111-111111111111'::uuid,
  'Lenovo Nigeria',
  'lenovo-nigeria',
  '/brands/lenovo.png',
  'Africa/Lagos',
  '#7B2FBE',
  '#0B0B0F',
  true,
  'LENOVO-ACCESS'
)
on conflict (slug) do nothing;

insert into public.organizations (id, name, slug, logo_url, timezone, primary_color, secondary_color, has_code_gate, access_code, kind)
values (
  '11111111-1111-4111-8111-111111111122'::uuid,
  'Veda',
  'veda',
  '/brands/veda.jpeg',
  'Africa/Nairobi',
  '#0EA5E9',
  '#0B0B0F',
  true,
  'VEDA-ACCESS',
  'schools'
)
on conflict (slug) do nothing;

-- ── auth users (trigger handle_new_user creates pending profiles) ────────────
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token,
  email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
  u.email, u.password_hash,
  now(), '{"provider":"email","providers":["email"]}'::jsonb,
  u.meta::jsonb, now(), now(), '', '', '', ''
from (values
  ('22222222-2222-4222-8222-000000000001'::uuid,'super.admin.demo@ba.fazoo.app', crypt('Demo-Super1!', gen_salt('bf')), jsonb_build_object('full_name','Ngozi Okafor','phone','+23480000000001','organization_slug','lenovo-nigeria')),
  ('22222222-2222-4222-8222-000000000002'::uuid,'org.admin.demo@ba.fazoo.app',  crypt('Demo-Admin1!', gen_salt('bf')), jsonb_build_object('full_name','Tunde Balogun','phone','+23480000000002','organization_slug','lenovo-nigeria')),
  ('22222222-2222-4222-8222-000000000003'::uuid,'supervisor.demo@ba.fazoo.app',crypt('Demo-SuperV1!', gen_salt('bf')), jsonb_build_object('full_name','Chiamaka Eze','phone','+23480000000003','organization_slug','lenovo-nigeria')),
  ('22222222-2222-4222-8222-000000000010'::uuid,'ba.one.demo@ba.fazoo.app',    crypt('Demo-Ba#001!', gen_salt('bf')), jsonb_build_object('full_name','Emeka Nwosu','phone','+23480000000010','organization_slug','lenovo-nigeria')),
  ('22222222-2222-4222-8222-000000000011'::uuid,'ba.two.demo@ba.fazoo.app',    crypt('Demo-Ba#002!', gen_salt('bf')), jsonb_build_object('full_name','Amina Sule','phone','+23480000000011','organization_slug','lenovo-nigeria')),
  ('22222222-2222-4222-8222-000000000012'::uuid,'ba.three.demo@ba.fazoo.app',  crypt('Demo-Ba#003!', gen_salt('bf')), jsonb_build_object('full_name','Kelechi Obi','phone','+23480000000012','organization_slug','lenovo-nigeria')),
  ('22222222-2222-4222-8222-000000000020'::uuid,'client.demo@ba.fazoo.app',    crypt('Demo-Client1!', gen_salt('bf')), jsonb_build_object('full_name','Lenovo Stakeholder','phone','+23480000000020','organization_slug','lenovo-nigeria'))
) as u(id, email, password_hash, meta)
where not exists (select 1 from auth.users au where au.id = u.id);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, 'email', 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now(), now()
from auth.users u
where u.email like '%@ba.fazoo.app'
on conflict do nothing;

-- ── roles & approval ─────────────────────────────────────────────────────────
-- Temporarily disable the privilege-escalation guard for seed data.
alter table public.profiles disable trigger guard_profile_update;

update public.profiles set role = 'super_admin',        account_status = 'approved' where id = '22222222-2222-4222-8222-000000000001'::uuid;
update public.profiles set role = 'organization_admin', account_status = 'approved' where id = '22222222-2222-4222-8222-000000000002'::uuid;
update public.profiles set role = 'supervisor',         account_status = 'approved' where id = '22222222-2222-4222-8222-000000000003'::uuid;
update public.profiles set role = 'client',             account_status = 'approved' where id = '22222222-2222-4222-8222-000000000020'::uuid;

-- Approved BAs with photos pending first upload; one BA left PENDING on purpose
update public.profiles set account_status = 'approved' where id = '22222222-2222-4222-8222-000000000010'::uuid;
update public.profiles set account_status = 'approved' where id = '22222222-2222-4222-8222-000000000011'::uuid;

alter table public.profiles enable trigger guard_profile_update;

-- ── campaign ─────────────────────────────────────────────────────────────────
insert into public.campaigns (id, organization_id, name, description, start_date, status)
values (
  '33333333-3333-4333-8333-333333333301'::uuid,
  '11111111-1111-4111-8111-111111111111'::uuid,
  'Retail Push Q3 2026',
  'Training campaign for local development only.',
  date_trunc('month', now())::date - interval '1 month',
  'active'
)
on conflict do nothing;

-- ── stores (fictitious demo locations around Lagos for geofence testing) ────
insert into public.stores (id, organization_id, name, address, latitude, longitude, geofence_radius_metres)
values
  ('44444444-4444-4444-8444-444444444401'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, 'Ikeja Tech Plaza',    'Plot 1, Sample Road, Ikeja',          6.601900,  3.351500, 200),
  ('44444444-4444-4444-8444-444444444402'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, 'Yaba Gadget Hub',     '12 Sample Street, Yaba',            6.509500,  3.371100, 250),
  ('44444444-4444-4444-8444-444444444403'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, 'Lekki Electronics Bay','34 Test Avenue, Lekki Phase 1',    6.445700,  3.552300, 150)
on conflict do nothing;

-- ── SKUs (public product-line names, fictitious codes) ──────────────────────
insert into public.skus (id, organization_id, campaign_id, name, code, status)
values
  ('55555555-5555-4555-8555-555555555501'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, '33333333-3333-4333-8333-333333333301'::uuid, 'ThinkPad E14 Gen 6',   'TP-E14-G6',  'active'),
  ('55555555-5555-4555-8555-555555555502'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, '33333333-3333-4333-8333-333333333301'::uuid, 'IdeaPad Slim 3',       'IP-SLIM3',   'active'),
  ('55555555-5555-4555-8555-555555555503'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, '33333333-3333-4333-8333-333333333301'::uuid, 'Tab M11',              'TAB-M11',    'active'),
  ('55555555-5555-4555-8555-555555555504'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, '33333333-3333-4333-8333-333333333301'::uuid, 'Smart Paper Display',  'SPD-10',     'inactive')
on conflict do nothing;

-- ── assignments (weekly off-days stored per assignment) ─────────────────────
insert into public.brand_ambassador_assignments
  (organization_id, brand_ambassador_id, campaign_id, store_id, weekly_off_day, start_date, status)
values
  ('11111111-1111-4111-8111-111111111111'::uuid, '22222222-2222-4222-8222-000000000010'::uuid, '33333333-3333-4333-8333-333333333301'::uuid, '44444444-4444-4444-8444-444444444401'::uuid, '{0,6}'::smallint[], current_date - 30, 'active'),
  ('11111111-1111-4111-8111-111111111111'::uuid, '22222222-2222-4222-8222-000000000011'::uuid, '33333333-3333-4333-8333-333333333301'::uuid, '44444444-4444-4444-8444-444444444402'::uuid, '{2}'::smallint[], current_date - 30, 'active');

-- ── supervisor scope: sees the Ikeja store ───────────────────────────────────
insert into public.supervisor_scopes (organization_id, supervisor_id, store_id)
values ('11111111-1111-4111-8111-111111111111'::uuid, '22222222-2222-4222-8222-000000000003'::uuid, '44444444-4444-4444-8444-444444444401'::uuid)
on conflict do nothing;

-- ── multi-brand memberships (one account → many brands) ─────────────────────
-- Emeka (BA 1) belongs to both Lenovo (approved) and Veda (approved) to
-- exercise the brand-switcher.
insert into public.organization_memberships
  (user_id, organization_id, role, account_status, access_code_used, code_granted_at)
values
  ('22222222-2222-4222-8222-000000000010'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, 'brand_ambassador', 'approved', 'LENOVO-ACCESS', now()),
  ('22222222-2222-4222-8222-000000000010'::uuid, '11111111-1111-4111-8111-111111111122'::uuid, 'brand_ambassador', 'approved', 'VEDA-ACCESS',   now()),
  ('22222222-2222-4222-8222-000000000011'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, 'brand_ambassador', 'approved', 'LENOVO-ACCESS', now()),
  ('22222222-2222-4222-8222-000000000012'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, 'brand_ambassador', 'pending',   null,          null)
on conflict (user_id, organization_id) do nothing;

-- Backfill any profile that landed without a membership (e.g. super admin,
-- org admin, supervisor, client) so their profile mirror stays consistent.
insert into public.organization_memberships
  (user_id, organization_id, role, account_status)
select id, organization_id, role, account_status
from public.profiles
where not exists (
  select 1 from public.organization_memberships m
  where m.user_id = profiles.id and m.organization_id = profiles.organization_id
)
on conflict (user_id, organization_id) do nothing;

-- ── Veda ────────────────────────────────────────────────────────────────────
-- The Veda organization, its access code and multi-brand memberships are
-- created above. Veda's operational data (schools, stationery, BA visits) is
-- imported from real CSVs by scripts/migrate-csv.ts (never seeded, per
-- AGENTS.md rules 7 & 8); no Veda demo rows exist here.
