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
- [x] seed.sql — fictitious demo org, stores, SKUs, assignments
- [ ] Generate `database.types.ts` via Supabase CLI once a project exists
      (hand-written equivalent committed meanwhile)

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
- [ ] Maestro flows executed on device/emulator

## Phase 6 — Administration ◐

- [x] Overview cards + filters (URL-encoded)
- [x] Daily logs list + detail (GPS, maps links, photos, sales, audit)
- [x] Sales-by-store dashboard with drill-down data tables
- [x] BA list / pending queue / detail / status controls
- [x] Stores, SKUs, campaigns management screens
- [x] CSV export honouring filters, Nigerian time formatting
- [x] Audit logs viewer
- [ ] Recharts trend visualisations polish

## Phase 7 — Verification ◐

- [x] `pnpm lint && pnpm typecheck && pnpm test` green across all workspaces
- [x] All migrations + seed.sql parse against the real Postgres grammar
      (libpg-query). Full `supabase db reset` still pending — needs Docker on
      the dev machine or CI.
- [ ] Local Supabase end-to-end run against migrations + RLS role tests
- [ ] Accessibility pass (labels, contrast, focus states)
- [ ] Responsive layout pass
- [x] Setup/deployment documentation final review

## Sequencing notes

Phases 1–6 have their core paths implemented, compiling and unit-tested.
Remaining items require infrastructure this machine lacks (Docker for the
local Supabase stack) or physical devices (camera/geolocation Maestro runs,
Playwright against a live stack); each is tracked explicitly so nothing is
claimed complete without verification.
