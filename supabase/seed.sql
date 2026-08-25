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
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── organization ─────────────────────────────────────────────────────────────
insert into public.organizations (id, name, slug, timezone, primary_color, secondary_color)
values (
  '11111111-1111-4111-8111-111111111111',
  'Lenovo Nigeria (Demo)',
  'lenovo-nigeria',
  'Africa/Lagos',
  '#7B2FBE',
  '#0B0B0F'
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
  ('22222222-2222-4222-8222-000000000001','super.admin.demo@ba.fazoo.app', crypt('Demo-Super1!', gen_salt('bf')), jsonb_build_object('full_name','Ngozi Okafor (Demo)','phone','+23480000000001','organization_slug','lenovo-nigeria')),
  ('22222222-2222-4222-8222-000000000002','org.admin.demo@ba.fazoo.app',  crypt('Demo-Admin1!', gen_salt('bf')), jsonb_build_object('full_name','Tunde Balogun (Demo)','phone','+23480000000002','organization_slug','lenovo-nigeria')),
  ('22222222-2222-4222-8222-000000000003','supervisor.demo@ba.fazoo.app',crypt('Demo-SuperV1!', gen_salt('bf')), jsonb_build_object('full_name','Chiamaka Eze (Demo)','phone','+23480000000003','organization_slug','lenovo-nigeria')),
  ('22222222-2222-4222-8222-000000000010','ba.one.demo@ba.fazoo.app',    crypt('Demo-Ba#001!', gen_salt('bf')), jsonb_build_object('full_name','Emeka Nwosu (Demo)','phone','+23480000000010','organization_slug','lenovo-nigeria')),
  ('22222222-2222-4222-8222-000000000011','ba.two.demo@ba.fazoo.app',    crypt('Demo-Ba#002!', gen_salt('bf')), jsonb_build_object('full_name','Amina Sule (Demo)','phone','+23480000000011','organization_slug','lenovo-nigeria')),
  ('22222222-2222-4222-8222-000000000012','ba.three.demo@ba.fazoo.app',  crypt('Demo-Ba#003!', gen_salt('bf')), jsonb_build_object('full_name','Kelechi Obi (Demo)','phone','+23480000000012','organization_slug','lenovo-nigeria'))
) as u(id, email, password_hash, meta)
where not exists (select 1 from auth.users au where au.id = u.id);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, 'email', 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now(), now()
from auth.users u
where u.email like '%.demo@ba.fazoo.app'
on conflict do nothing;

-- ── roles & approval ─────────────────────────────────────────────────────────
update public.profiles set role = 'super_admin',        account_status = 'approved' where id = '22222222-2222-4222-8222-000000000001';
update public.profiles set role = 'organization_admin', account_status = 'approved' where id = '22222222-2222-4222-8222-000000000002';
update public.profiles set role = 'supervisor',         account_status = 'approved' where id = '22222222-2222-4222-8222-000000000003';

-- Approved BAs with photos pending first upload; one BA left PENDING on purpose
update public.profiles set account_status = 'approved' where id = '22222222-2222-4222-8222-000000000010';
update public.profiles set account_status = 'approved' where id = '22222222-2222-4222-8222-000000000011';

-- ── campaign ─────────────────────────────────────────────────────────────────
insert into public.campaigns (id, organization_id, name, description, start_date, status)
values (
  '33333333-3333-4333-8333-333333333301',
  '11111111-1111-4111-8111-111111111111',
  'Retail Push Q3 2026 (Demo)',
  'Demonstration campaign for local development only.',
  date_trunc('month', now())::date - interval '1 month',
  'active'
)
on conflict do nothing;

-- ── stores (fictitious demo locations around Lagos for geofence testing) ────
insert into public.stores (id, organization_id, name, address, latitude, longitude, geofence_radius_metres)
values
  ('44444444-4444-4444-8444-444444444401', '11111111-1111-4111-8111-111111111111', 'Ikeja Tech Plaza (Demo)',    'Plot 1, Demo Road, Ikeja',          6.601900,  3.351500, 200),
  ('44444444-4444-4444-8444-444444444402', '11111111-1111-4111-8111-111111111111', 'Yaba Gadget Hub (Demo)',     '12 Sample Street, Yaba',            6.509500,  3.371100, 250),
  ('44444444-4444-4444-8444-444444444403', '11111111-1111-4111-8111-111111111111', 'Lekki Electronics Bay (Demo)','34 Test Avenue, Lekki Phase 1',    6.445700,  3.552300, 150)
on conflict do nothing;

-- ── SKUs (public product-line names, fictitious codes) ──────────────────────
insert into public.skus (id, organization_id, campaign_id, name, code, status)
values
  ('55555555-5555-4555-8555-555555555501', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333301', 'ThinkPad E14 Gen 6',   'TP-E14-G6',  'active'),
  ('55555555-5555-4555-8555-555555555502', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333301', 'IdeaPad Slim 3',       'IP-SLIM3',   'active'),
  ('55555555-5555-4555-8555-555555555503', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333301', 'Tab M11',              'TAB-M11',    'active'),
  ('55555555-5555-4555-8555-555555555504', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333301', 'Smart Paper Display',  'SPD-10',     'inactive')
on conflict do nothing;

-- ── assignments (weekly off-days stored per assignment) ─────────────────────
insert into public.brand_ambassador_assignments
  (organization_id, brand_ambassador_id, campaign_id, store_id, weekly_off_day, start_date, status)
values
  ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-000000000010', '33333333-3333-4333-8333-333333333301', '44444444-4444-4444-8444-444444444401', 0, current_date - 30, 'active'),
  ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-000000000011', '33333333-3333-4333-8333-333333333301', '44444444-4444-4444-8444-444444444402', 2, current_date - 30, 'active');

-- ── supervisor scope: sees the Ikeja store ───────────────────────────────────
insert into public.supervisor_scopes (organization_id, supervisor_id, store_id)
values ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-000000000003', '44444444-4444-4444-8444-444444444401')
on conflict do nothing;
