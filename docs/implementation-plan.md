# Fazoo Implementation Plan

Status legend: ☐ todo · ◐ in progress · ☑ done

## Phase 1 — Discovery and plan ☑

- [x] Inspect repository (legacy code exists only in git history; working tree clean)
- [x] Study legacy workflows: 3-step check-in, sales-until-checkout locking,
      fresh-GPS checkout, registration uploads
- [x] Catalogue insecure legacy patterns to avoid (plain-text passwords,
      unauthenticated exports, phpinfo, CORS `*`)
- [x] docs/architecture.md

## Phase 2 — Framework ☑

- [x] pnpm monorepo + TypeScript strict base config
- [x] packages/config · types · validation · database · ui
- [x] apps/admin (Next.js 16 App Router) and apps/mobile (Expo SDK 57)
- [x] ESLint flat config, Prettier, Vitest
- [x] `.env.example` templates at root and per app

## Phase 3 — Supabase foundation ☑

- [x] `00001_schema.sql` — enums, tables, indexes, constraints
- [x] `00002_functions_triggers.sql` — helpers, auth-user→profile trigger,
      audit triggers, updated_at maintenance
- [x] `00003_rls.sql` — table policies + private storage buckets/policies
- [x] `00004_rpc.sql` — idempotent BA RPCs + admin RPCs + rate limiting
- [x] `00005_idempotent_sale_edits.sql` — idempotent sales line-item edits
- [x] `00006_grants.sql` — explicit grants
- [x] `00011_service_role_grants.sql` — restored standard service_role
      GRANT ALL (latent bug fix: service key previously had no privileges)
- [x] seed.sql — fictitious demo org(s), stores, SKUs, assignments
- [x] Generate `database.types.ts` via Supabase CLI — local `supabase gen
      types typescript --local` after DB reset now reflects all tables/RPCs
- [x] Local Supabase stack runs on this machine (Docker available; repeated
      `supabase db reset` applied through migration `00011` + seed cleanly)

## Phase 4 — Authentication and registration ◐

- [x] Registration form + Zod validation + photo upload to private bucket
- [x] Pending-approval gating (mobile route guard + SQL checks)
- [x] Admin approval queue + approve/reject/suspend RPCs
- [x] Change password; forgot-password screen (self-service / admin-triggered)
- [ ] Playwright specs for role isolation

## Phase 5 — BA operations ◐

- [x] Today dashboard state machine (no log / open / completed / sick / off-day)
- [x] 3-step check-in wizard with geofence gate + camera steps
- [x] Sales recording (multi-SKU, edit/remove until checkout)
- [x] Checkout confirmation + lock
- [x] Sick leave flow
- [x] Offline queue + sync engine skeletons (SQLite)
- [x] Leave requests (self-service + admin review) — `00008_leave_requests.sql`
- [ ] Maestro flows executed on device/emulator

## Phase 6 — Administration ◐

- [x] Overview cards + filters (URL-encoded)
- [x] Daily logs list + detail (GPS, maps links, photos, sales, audit)
- [x] Sales-by-store dashboard with drill-down data tables
- [x] BA list / pending queue / detail / status controls
- [x] Stores, SKUs, campaigns management screens
- [x] CSV export honouring filters, Nigerian time formatting
- [x] Audit logs viewer
- [x] Leave-requests review screen
- [ ] Recharts trend visualisations polish

## Phase 7 — Multi-brand expansion ☑

- [x] `00009_organization_memberships.sql` — memberships, `has_code_gate` /
      `access_code` on orgs, sync trigger, RLS, cross-brand migration + switch
      RPCs (`my_memberships`, `joinable_brands`, `ba_unlock_brand`,
      `ba_switch_brand`, `ba_request_org_membership`,
      `admin_list_pending_memberships`)
- [x] One sign-in + per-brand access code + in-app brand picker / switcher
- [x] Cross-brand BA = one profile, secondary membership switchable in-app
- [x] Second client org (Veda, Africa/Nairobi) + `00010_veda_schema.sql`
      (`veda_schools`, `veda_sessions`, `veda_activities` + RLS)
- [x] Admin pending queue shows Brand column

## Phase 8 — Legacy data migration ☑

- [x] `scripts/migrate-csv.ts` (+ root `pnpm migrate:csv --brand=lenovo|veda|all`)
      — service-role import, Nominatim geocoding with disk cache, telephony
      normalization, BA identity mapping (match phone/email → user else create,
      approved membership), store/school nearest-assignment, fully idempotent
- [x] Lenovo imported: 16 stores, 11 BAs, 69 daily logs, campaign + 4 SKUs,
      5 per-log sales entries
- [x] Veda imported: 85 schools, 31 BAs, 74 sessions, 137 activities
- [x] `packages/database/src/database.types.ts` regenerated (Veda tables +
      membership RPCs); workspace typecheck/lint/test green

## Phase 9 — Verification ◐

- [x] `pnpm lint && pnpm typecheck && pnpm test` green across all workspaces
- [x] All migrations + seed.sql apply cleanly via `supabase db reset`
- [x] Import idempotency verified (re-runs produce no duplicates)
- [ ] Full local RLS role-isolation test suite (`supabase/tests/rls_rpc.sql`)
      as automated pass
- [ ] Device/emulator E2E: GPS geofence + camera check-in, Maestro flows
- [ ] Playwright role-isolation specs
- [ ] Accessibility pass (labels, contrast, focus states)
- [ ] Responsive layout pass
- [x] Setup/deployment documentation final review

## Known gaps (accepted trade-offs)

- Only 2 Lenovo stores geocoded → most daily logs assigned to a clearly-flagged
  "Unknown Location (Legacy Import)" placeholder store for admin to fix; 60 Veda
  session schools were auto-created from titles (region blank), and Veda
  sessions reference those auto-created school ids.
- No per-log SKU line items existed for most Lenovo rows beyond the 5 found in
  the per-BA exports; all found line items are imported.

## Sequencing notes

Core paths for the original phases 1–6 are implemented, compiling and
unit-tested. The platform has since been expanded for multi-brand (phase 7)
and real data migration (phase 8), both verified against the running local
stack. Remaining items are infra/device-dependent (camera/geolocation Maestro
runs, Playwright against a live stack, RLS role tests) or polish (a11y,
responsive, charts); each is tracked explicitly so nothing is claimed complete
without verification.
