# Testing & data import runbook

## RLS / RPC role-isolation suite (Postgres)

`supabase/tests/rls_rpc.sql` exercises retail AND Veda (schools org) flows as
BA / org admin / super admin inside one rolled-back transaction:
brand switch, geofence check-in/out, idempotent client_request_id replay,
stationery distribution + post-checkout guards, cross-BA and cross-org RLS
denial, admin upsert org-scoping, super-admin cross-org reads, and the
operation_receipts + audit_logs trail.

Run against a fresh local stack:

```bash
cd supabase && supabase db reset
docker exec -i supabase_db_fazoo psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -f - < ../supabase/tests/rls_rpc.sql   # from repo root: supabase/tests/rls_rpc.sql
```

No output beyond rollback + `DO` means everything passed; any `ERROR` with
`CONTEXT: ... at RAISE` names the failed assertion.

## Admin portal e2e (Playwright)

Two modes — same specs, different targets:

- **Local stack** (recommended for day-to-day):
  1. `cd supabase && supabase start` (stack must run with the seed users).
  2. `cp apps/admin/.env.e2e.example apps/admin/.env.e2e.local` and set
     `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the `supabase start` output.
  3. `pnpm --filter @fazoo/admin test:e2e:local` — starts a Next dev server on
     :3000 with the local env, then runs Playwright against it.
- **Hosted project** (CI): set `PLAYWRIGHT_BASE_URL` and the
  `E2E_ADMIN_*` / `E2E_ORG_ADMIN_*` / `E2E_BA_*` credentials pointed at real
  accounts, then `pnpm test:e2e`.

Notes:
- `apps/admin/e2e/roles.spec.ts` covers role isolation (BA blocked from staff
  routes + CSV export; org-admin access; super-admin views). It relies on
  BA/org-admin accounts that only exist in the local seed by default.
- Playwright reuses one `storageState` (`.auth/admin.json`) across tests. If a
  suite run shows authenticated tests unexpectedly landing on `/sign-in`,
  delete `.auth/admin.json` and rerun (stale session from a prior run).

## Veda legacy-data import (`pnpm migrate:csv --brand=veda`)

The one-off importer (`scripts/migrate-csv.ts`) reads the REAL operational CSVs
from `migration/data/` (gitignored — never commit customer data, AGENTS.md 7/8).
Required files and columns:

| File | Columns |
|------|---------|
| `veda-brand-ambassadors.csv` | `legacy_id`, `full_name`, `phone`, `email`, `is_admin` |
| `veda-schools.csv` | `id`, `title`, `region` |
| `veda-sessions.csv` | `id`, `title`, `school_id`, `ba_id`, `session_date`, `activity_type`, `status`, `learner_count` |

- `activity_type` is a comma-separated list; recognized activities (mapped to
  `veda_activities`): `crayon_colouring`, `watercolour_painting`, `paper_crafts`.
- `status` maps to `completed` → `veda_sessions.status = 'completed'`, anything
  else → `'open'`.
- Schools are OK to be a subset — sessions referencing schools absent from the
  CSV are auto-created from the session title (trailing `— YYYY-MM-DD` is
  stripped) and geocoded from OSM.
- Run with `--brand=veda --only=bas --veda-bas-file=<file>` to import just the
  BA registry (e.g. before ships so sessions resolve).

Note: **stationery, assignments and photos are NOT CSV-imported.** Stations
(catalogue items) and per-BA school assignments are managed directly in the
admin portal (`/veda-assignments`) and via the `veda_admin_upsert_*` RPCs.