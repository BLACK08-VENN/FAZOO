# Fazoo Architecture

Fazoo is a multi-tenant field-force management and sales-reporting platform.
Brand Ambassadors (BAs) check in at retail stores, photograph stock, record
sales by SKU and check out. Administrators manage people, places, campaigns
and reports.

The initial client is **Lenovo Nigeria**, but every row of operational data is
scoped to an `organization`, so new companies and campaigns are first-class.

## 1. System overview

```text
┌────────────────────┐        ┌─────────────────────────┐
│  apps/mobile       │        │  apps/admin             │
│  Expo + expo-router│        │  Next.js App Router     │
│  BA application    │        │  Administration portal  │
└─────────┬──────────┘        └───────────┬─────────────┘
          │  supabase-js (anon key)       │  @supabase/ssr (cookies)
          ▼                               ▼
┌─────────────────────────────────────────────────────────────┐
│                     Supabase project                        │
│  Auth (phone-number identity over email alias)              │
│  Postgres + Row-Level Security + SECURITY DEFINER RPCs      │
│  Storage: private buckets profile-photos, daily-log-photos  │
└─────────────────────────────────────────────────────────────┘
```

### Monorepo layout

| Path | Purpose |
| --- | --- |
| `apps/admin` | Next.js administration portal |
| `apps/mobile` | Expo React Native BA application |
| `packages/types` | Shared TypeScript domain types |
| `packages/validation` | Shared Zod schemas + phone/date utilities |
| `packages/database` | Typed Supabase client factories + database types |
| `packages/config` | Constants: timezone helpers, geofence defaults, design tokens |
| `packages/ui` | Shared design tokens (CSS custom properties) |
| `supabase/` | SQL migrations, seed data, local config |

Package manager: **pnpm** with `node-linker=hoisted` for Metro/Next compatibility.

## 2. Core decisions

### 2.1 Identity and authentication

* Supabase Auth owns all credentials. There is **no password column** anywhere.
* BAs sign in with **mobile number + password**. Supabase phone auth requires an
  SMS provider, so until one is configured we map a normalized Nigerian number
  to an internal email alias `<digits>@ba.fazoo.app`. The alias never leaves the
  app code; users see their phone number.
* New registrations are created with `account_status = 'pending'` and cannot
  reach operational screens (enforced in-app *and* by RLS/RPC checks).
* **Change password**: self-service via `supabase.auth.updateUser`.
* **Forgot password**: two supported paths —
  1. Enable Supabase phone/SMS OTP for true self-service reset (documented),
  2. Administrator-triggered reset link (service-role route handler, role-checked,
     rate-limited) delivered out-of-band by the supervisor.

### 2.2 Server-side trust boundary

Client-supplied values are **never trusted** for:

* organization id, BA id, role or approval status — derived from the JWT via
  `public.current_profile()`;
* attendance date — recomputed as `(now() AT TIME ZONE 'Africa/Lagos')::date`;
* timestamps — set by the database (`now()`), not the client;
* distances — haversine computed inside Postgres from store coordinates;
* quantities and statuses — validated by Zod at the edge and re-validated by
  SQL functions/constraints.

All mutating BA operations go through SECURITY DEFINER RPCs:
`ba_checkin`, `ba_checkout`, `ba_record_sale`, `ba_update_sale`,
`ba_delete_sale`, `ba_mark_sick_leave`. Administrative mutations go through
`admin_*` RPCs guarded by role checks. RLS policies provide defense in depth on
every table.

### 2.3 Idempotency and offline support

The mobile app queues operations in Expo SQLite with a generated
`client_request_id` (UUIDv7-ish). Every BA RPC accepts this id and records it in
`operation_receipts` (unique). A retry after reconnect replays the stored result
instead of duplicating rows. Nothing is marked "synced" until Supabase confirms.

### 2.4 Timezone discipline

Timestamps are stored in UTC (`timestamptz`). Attendance grouping uses
`Africa/Lagos` (UTC+1, no DST). Shared pure helpers live in
`packages/config/src/timezone.ts`; SQL mirrors them with
`(now() AT TIME ZONE 'Africa/Lagos')`.

### 2.5 Photographs

Private storage buckets only. Path convention
`{organization_id}/{auth_user_id}/{uuid}.{ext}`. Storage RLS restricts each user
to their own folder; admins get scoped read access through policies. Admin UI
renders photos via short-lived signed URLs minted by authorized requests.
Permanent public URLs do not exist.

### 2.6 Geofencing

Stores carry `latitude`, `longitude` and `geofence_radius_metres`
(default 200 m, admin-editable). Check-in is blocked outside the radius.
Checkout outside the radius follows the per-organization setting
`organizations.settings.allow_out_of_geofence_checkout` (`false` = block,
`true` = allow but flag the log for review via `daily_logs.flagged`).

### 2.7 Weekly off-day

Stored per assignment (`weekly_off_day smallint`, 0 = Sunday … 6 = Saturday).
Check-in on the off-day is rejected by RPC; dashboards distinguish
weekly off from absence and sick leave.

## 3. Data model summary

```
organizations ─┬─ profiles (1:1 auth.users)
               ├─ campaigns ── skus
               ├─ stores
               ├─ brand_ambassador_assignments (BA ↔ campaign ↔ store)
               ├─ daily_logs ─┬─ sales_entries (per SKU rows, NOT JSON)
               │              └─ daily_log_photos (stock_shelf, uniform_selfie, …)
               ├─ supervisor_scopes (which stores/campaigns a supervisor sees)
               ├─ operation_receipts (idempotency)
               └─ audit_logs
```

Key constraints:

* One active assignment per BA (partial unique index).
* One non-cancelled daily log per BA + campaign + Lagos calendar date
  (partial unique index).
* Sales entries are individual rows referencing `skus` — queryable, indexable,
  auditable (the legacy system stored JSON blobs; we deliberately do not).
* `audit_logs` captures approvals, assignments, check-in/out, sick leave,
  reopenings and administrative edits.

Full details in [database.md](./database.md).

## 4. Roles

`super_admin` (platform) › `organization_admin` › `supervisor` (scoped to
assigned stores/campaigns) › `brand_ambassador` (own data only).
Details and the policy matrix live in
[roles-and-permissions.md](./roles-and-permissions.md).

## 5. Security posture

* RLS enabled on every table and both storage buckets.
* No service-role key outside server-only route handlers; never shipped to
  browser or mobile bundles.
* Rate limiting on sign-in and CSV export (DB-backed sliding window +
  in-memory guard).
* Security headers via Next middleware.
* Secrets only in `.env` files (gitignored); `.env.example` holds placeholders.
* Legacy patterns explicitly banned: plain-text passwords, phpinfo,
  unauthenticated export/cleanup endpoints, hard-coded tenant data.

## 6. Testing strategy

| Layer | Tool | Scope |
| --- | --- | --- |
| Pure logic | Vitest | Phone normalization, Lagos dates, Zod schemas, haversine |
| Admin e2e | Playwright | Sign-in, approve BA, filters, CSV download |
| Mobile flows | Maestro | Register → pending → approved → check-in → sales → checkout |
| RLS | pgTAP-style SQL scripts run against local Supabase | Cross-org isolation, cross-BA isolation |

Acceptance criteria checklist (section 20 of the product brief) maps to
`docs/verification.md` as flows land.
