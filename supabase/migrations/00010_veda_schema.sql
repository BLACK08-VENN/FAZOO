-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo 00010 — Veda brand schema (schools / sessions / activities)
-- Veda runs learner-colouring & craft sessions at schools rather than retail
-- store visits. Holds its own attendance model alongside the retail core:
--   veda_schools   → the learning venues Veda visits (scoped to the org)
--   veda_sessions  → one visit by a BA to a school on a date (legacy imported)
--   veda_activities→ the colouring/craft activities delivered in each session
-- Legacy records keep their original `legacy_id` for audit/traceability. All
-- real world data (school names, learner counts) is imported by the one-off
-- migration script, never committed in seed (AGENTS.md rules 7 & 8).
-- ═══════════════════════════════════════════════════════════════════════════

create type public.veda_activity_type as enum (
  'crayon_colouring',
  'watercolour_painting',
  'paper_crafts'
);

-- ── schools (the venues Veda visits) ────────────────────────────────────────
create table public.veda_schools (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  legacy_id       bigint not null,
  name            text not null,
  region          text,
  latitude        double precision check (latitude between -90 and 90),
  longitude       double precision check (longitude between -180 and 180),
  status          store_status not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint veda_schools_org_legacy_unique unique (organization_id, legacy_id)
);
create index veda_schools_org_idx on public.veda_schools (organization_id, status);

-- ── sessions (a BA visiting a school on a date) ─────────────────────────────
create table public.veda_sessions (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id),
  legacy_id           bigint not null,
  school_id           uuid not null references public.veda_schools(id),
  brand_ambassador_id uuid not null references public.profiles(id) on delete cascade,
  session_date        date not null,             -- Africa/Nairobi calendar date
  learner_count       integer not null check (learner_count >= 0),
  status              daily_log_status not null default 'completed',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint veda_sessions_org_legacy_unique unique (organization_id, legacy_id)
);
create index veda_sessions_org_idx   on public.veda_sessions (organization_id, session_date desc);
create index veda_sessions_school_idx on public.veda_sessions (school_id, session_date desc);
create index veda_sessions_ba_idx     on public.veda_sessions (brand_ambassador_id, session_date desc);

-- ── activities (colouring / painting / craft delivered in a session) ────────
create table public.veda_activities (
  id             uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  session_id     uuid not null references public.veda_sessions(id) on delete cascade,
  activity_type  public.veda_activity_type not null,
  learner_count  integer not null check (learner_count >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint veda_activities_unique unique (session_id, activity_type)
);
create index veda_activities_session_idx on public.veda_activities (session_id);
create index veda_activities_org_idx on public.veda_activities (organization_id);

-- ── audit triggers (mirror platform conventions) ────────────────────────────
create trigger audit_veda_schools    after insert or update or delete on public.veda_schools
  for each row execute function public.audit_row_change();
create trigger audit_veda_sessions   after insert or update or delete on public.veda_sessions
  for each row execute function public.audit_row_change();
create trigger audit_veda_activities after insert or update or delete on public.veda_activities
  for each row execute function public.audit_row_change();
create trigger set_updated_at_veda_schools    before update on public.veda_schools
  for each row execute function public.set_updated_at();
create trigger set_updated_at_veda_sessions   before update on public.veda_sessions
  for each row execute function public.set_updated_at();
create trigger set_updated_at_veda_activities before update on public.veda_activities
  for each row execute function public.set_updated_at();

-- ── RLS: enable and policies ─────────────────────────────────────────────────
alter table public.veda_schools    enable row level security;
alter table public.veda_sessions   enable row level security;
alter table public.veda_activities enable row level security;

-- Approved staff/members of the org may read the org's Veda data.
create policy veda_schools_select_org on public.veda_schools
  for select using (public.can_read_org(organization_id));
create policy veda_sessions_select_org on public.veda_sessions
  for select using (public.can_read_org(organization_id));
create policy veda_activities_select_org on public.veda_activities
  for select using (public.can_read_org(organization_id));

-- A session's own BA may read their own sessions/activities (self-service).
create policy veda_sessions_self_read on public.veda_sessions
  for select using (brand_ambassador_id = auth.uid());
create policy veda_activities_self_read on public.veda_activities
  for select using (
    exists (
      select 1 from public.veda_sessions s
      where s.id = session_id and s.brand_ambassador_id = auth.uid()
    )
  );

-- Org admins may mutate Veda data within their org (imports happen via the
-- service role during migration; this covers admin UI edits going forward).
create policy veda_schools_org_admin_all on public.veda_schools
  for all using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
create policy veda_sessions_org_admin_all on public.veda_sessions
  for all using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
create policy veda_activities_org_admin_all on public.veda_activities
  for all using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- ── grants (authenticated) ───────────────────────────────────────────────────
grant select on public.veda_schools    to authenticated;
grant select on public.veda_sessions   to authenticated;
grant select on public.veda_activities to authenticated;
