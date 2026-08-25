-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo 00001 — core schema
-- Multi-tenant field-force management. UUID PKs, FKs, indexes, constraints.
-- Timestamps UTC (timestamptz); attendance dates computed in Africa/Lagos.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;
create schema if not exists private;

-- ── Enumerated types ────────────────────────────────────────────────────────
create type app_role            as enum ('super_admin','organization_admin','supervisor','brand_ambassador');
create type account_status      as enum ('pending','approved','rejected','suspended','inactive');
create type organization_status as enum ('active','suspended');
create type campaign_status     as enum ('draft','active','completed','cancelled');
create type store_status        as enum ('active','inactive');
create type assignment_status   as enum ('active','ended','cancelled');
create type sku_status          as enum ('active','inactive');
create type attendance_status   as enum ('present','sick_leave','weekly_off','absent');
create type daily_log_status    as enum ('open','completed','cancelled');
create type photo_type          as enum ('stock_shelf','uniform_selfie','checkout','other');

-- ── organizations ───────────────────────────────────────────────────────────
create table public.organizations (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  slug            text not null unique,
  logo_url        text,
  primary_color   text,
  secondary_color text,
  timezone        text not null default 'Africa/Lagos',
  status          organization_status not null default 'active',
  -- Per-tenant behaviour flags (see packages/config constants.ts)
  settings        jsonb not null default '{"allow_out_of_geofence_checkout": false}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint organizations_slug_format check (slug ~ '^[a-z0-9-]{2,60}$')
);

-- ── profiles (1:1 with auth.users; credentials never stored here) ───────────
create table public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  organization_id    uuid not null references public.organizations(id),
  full_name          text not null,
  phone              text not null,
  profile_photo_path text,
  role               app_role not null default 'brand_ambassador',
  account_status     account_status not null default 'pending',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint profiles_phone_e164 check (phone ~ '^\+[1-9]\d{7,14}$')
);
create index profiles_organization_idx   on public.profiles (organization_id, role);
create index profiles_pending_idx        on public.profiles (organization_id, account_status)
  where account_status = 'pending';

-- ── campaigns ───────────────────────────────────────────────────────────────
create table public.campaigns (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name            text not null,
  description     text,
  start_date      date not null,
  end_date        date,
  status          campaign_status not null default 'draft',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint campaigns_date_order check (end_date is null or start_date <= end_date)
);
create index campaigns_org_idx on public.campaigns (organization_id, status);

-- ── stores ──────────────────────────────────────────────────────────────────
create table public.stores (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id),
  name                   text not null,
  address                text,
  latitude               double precision not null check (latitude between -90 and 90),
  longitude              double precision not null check (longitude between -180 and 180),
  geofence_radius_metres integer not null default 200
                         check (geofence_radius_metres between 20 and 2000),
  status                 store_status not null default 'active',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index stores_org_idx on public.stores (organization_id, status);

-- ── BA assignments (BA ↔ campaign ↔ store, weekly off-day lives here) ──────
create table public.brand_ambassador_assignments (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id),
  brand_ambassador_id uuid not null references public.profiles(id) on delete cascade,
  campaign_id         uuid not null references public.campaigns(id),
  store_id            uuid not null references public.stores(id),
  weekly_off_day      smallint not null check (weekly_off_day between 0 and 6), -- 0=Sun…6=Sat
  start_date          date not null,
  end_date            date,
  status              assignment_status not null default 'active',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint assignments_date_order check (end_date is null or start_date <= end_date)
);
-- A BA holds at most one ACTIVE assignment at any time.
create unique index assignments_one_active_idx
  on public.brand_ambassador_assignments (brand_ambassador_id)
  where status = 'active';
create index assignments_store_idx   on public.brand_ambassador_assignments (store_id, status);
create index assignments_campaign_idx on public.brand_ambassador_assignments (campaign_id, status);

-- ── SKUs ────────────────────────────────────────────────────────────────────
create table public.skus (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  campaign_id     uuid not null references public.campaigns(id),
  name            text not null,
  code            text not null,
  description     text,
  status          sku_status not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index skus_campaign_code_idx on public.skus (campaign_id, code);
create index skus_org_idx on public.skus (organization_id, status);

-- ── daily_logs (one per BA+campaign+Lagos-date; photos live separately) ────
create table public.daily_logs (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations(id),
  campaign_id              uuid not null references public.campaigns(id),
  brand_ambassador_id      uuid not null references public.profiles(id) on delete cascade,
  store_id                 uuid not null references public.stores(id),
  attendance_date          date not null,           -- Africa/Lagos calendar date
  attendance_status        attendance_status not null default 'present',
  checkin_at               timestamptz,
  checkout_at              timestamptz,
  checkin_latitude         double precision,
  checkin_longitude        double precision,
  checkout_latitude        double precision,
  checkout_longitude       double precision,
  checkin_distance_metres  double precision,
  checkout_distance_metres double precision,
  notes                    text,
  status                   daily_log_status not null default 'open',
  -- Checkout outside geofence when tenant permits it (flagged for review)
  flagged                  boolean not null default false,
  reopened_by              uuid references public.profiles(id),
  client_request_id        uuid,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint daily_logs_coords_pairing check (
    (checkin_latitude  is null) = (checkin_longitude  is null) and
    (checkout_latitude is null) = (checkout_longitude is null)
  ),
  constraint daily_logs_checkout_requires_open check (checkout_at is null or status in ('open','completed'))
);

-- One normal (non-cancelled) log per BA + campaign + Lagos calendar date
create unique index daily_logs_unique_day_idx
  on public.daily_logs (brand_ambassador_id, campaign_id, attendance_date)
  where status <> 'cancelled';
-- Idempotent offline retries
create unique index daily_logs_client_request_idx
  on public.daily_logs (client_request_id)
  where client_request_id is not null;

-- Reporting indexes (organization / campaign / BA / store / date)
create index daily_logs_org_report_idx  on public.daily_logs (organization_id, attendance_date desc);
create index daily_logs_campaign_report_idx on public.daily_logs (campaign_id, attendance_date desc);
create index daily_logs_ba_report_idx   on public.daily_logs (brand_ambassador_id, attendance_date desc);
create index daily_logs_store_report_idx on public.daily_logs (store_id, attendance_date desc);
create index daily_logs_status_idx      on public.daily_logs (organization_id, status)
  where status = 'open';

-- ── sales_entries (one row per SKU per log — never JSON blobs) ──────────────
create table public.sales_entries (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id),
  daily_log_id      uuid not null references public.daily_logs(id) on delete cascade,
  sku_id            uuid not null references public.skus(id),
  quantity          integer not null check (quantity between 1 and 100000),
  recorded_at       timestamptz not null default now(),
  client_request_id uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index sales_entries_log_idx       on public.sales_entries (daily_log_id);
create index sales_entries_sku_report_idx on public.sales_entries (sku_id);
create index sales_entries_org_report_idx on public.sales_entries (organization_id, recorded_at desc);
create unique index sales_entries_client_request_idx
  on public.sales_entries (client_request_id)
  where client_request_id is not null;

-- ── daily_log_photos ─────────────────────────────────────────────────────────
create table public.daily_log_photos (
  id             uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  daily_log_id   uuid not null references public.daily_logs(id) on delete cascade,
  photo_type     photo_type not null,
  storage_path   text not null,
  captured_at    timestamptz not null default now(),
  created_at     timestamptz not null default now()
);
create index daily_log_photos_log_idx on public.daily_log_photos (daily_log_id);
-- One canonical stock/selfie per log; extras only for 'other'
create unique index daily_log_photos_unique_type_idx
  on public.daily_log_photos (daily_log_id, photo_type)
  where photo_type in ('stock_shelf','uniform_selfie');

-- ── supervisor_scopes (which stores/campaigns a supervisor may see) ─────────
create table public.supervisor_scopes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  supervisor_id   uuid not null references public.profiles(id) on delete cascade,
  campaign_id     uuid references public.campaigns(id),
  store_id        uuid references public.stores(id),
  created_at      timestamptz not null default now(),
  constraint supervisor_scopes_scope_required check (campaign_id is not null or store_id is not null)
);
create index supervisor_scopes_supervisor_idx on public.supervisor_scopes (supervisor_id);

-- ── operation_receipts (idempotency for offline retries) ────────────────────
create table public.operation_receipts (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id),
  brand_ambassador_id uuid not null references public.profiles(id) on delete cascade,
  client_request_id   uuid not null unique,
  operation           text not null,
  result              jsonb,
  created_at          timestamptz not null default now()
);
create index operation_receipts_ba_idx
  on public.operation_receipts (brand_ambassador_id, operation, created_at desc);

-- ── audit_logs ──────────────────────────────────────────────────────────────
create table public.audit_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  actor_id        uuid references public.profiles(id) on delete set null,
  action          text not null,
  entity_type     text not null,
  entity_id       uuid,
  metadata        jsonb,
  created_at      timestamptz not null default now()
);
create index audit_logs_org_idx    on public.audit_logs (organization_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

-- ── rate_limits (fixed-window counter backing check_rate_limit RPC) ─────────
create table private.rate_limits (
  key          text primary key,
  window_start timestamptz not null,
  hit_count    integer not null default 0
);
