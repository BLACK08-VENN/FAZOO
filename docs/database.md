# Database

Everything lives in ordered SQL migrations under `supabase/migrations/`:

| File | Contents |
| --- | --- |
| `00001_schema.sql` | enums, tables, constraints, indexes, private storage buckets |
| `00002_functions_triggers.sql` | helpers, triggers, audit plumbing |
| `00003_rls.sql` | row-level security policies (tables + storage) |
| `00004_rpc.sql` | SECURITY DEFINER RPCs, grants, rate limiting |

## Conventions

- **UTC everywhere in storage.** Attendance *dates* are derived with
  `(now() AT TIME ZONE 'Africa/Lagos')::date` — never `now()::date`.
- **No password columns.** Auth is Supabase Auth only.
- **Phone identity:** `profiles.phone` stores canonical E.164
  (`+234XXXXXXXXXX`, CHECK-enforced). The auth e-mail is the internal alias
  `<digits>@ba.fazoo.app`.
- Every table carries `organization_id` (except org-independent ones), so all
  policies and RPCs can scope by tenant.

## Tables (public schema)

- `organizations` — tenants; `settings jsonb` holds flags like
  `allow_out_of_geofence_checkout`.
- `profiles` — one per auth user; `role`, `account_status`, phone, photo path.
  Created by the `handle_new_user` trigger from JWT metadata with status
  `pending`.
- `campaigns`, `stores`, `skus` — admin-curated; direct writes allowed for
  org admins/supervisors via RLS + `audit_row_change` triggers.
- `brand_ambassador_assignments` — BA ↔ campaign ↔ store with a weekly off day
  (`0=Sunday … 6=Saturday`). Partial unique index: at most one ACTIVE
  assignment per BA.
- `daily_logs` — one per BA+campaign+Lagos-date (partial unique index,
  non-cancelled). Holds check-in/out GPS + accuracy, status
  (`open/completed/cancelled`) and attendance (`present/sick_leave/…`),
  plus `client_request_id` (unique) for offline idempotency.
- `sales_entries` — per-log SKU quantities; immutable after checkout.
- `daily_log_photos` — stock-shelf / uniform-selfie / checkout photos;
  unique per `(log, type)` for the first three.
- `supervisor_scopes` — supervisor visibility over campaigns/stores.
- `operation_receipts` — replay ledger keyed by `client_request_id`;
  makes every client mutation idempotent.
- `audit_logs` — append-only trail written by triggers and RPCs.
- `private.rate_limits` — service-role-only counters (e.g. CSV exports).

## Trust boundary

Operational tables have **SELECT-only** RLS policies. There are deliberately
no INSERT/UPDATE/DELETE policies on them: all BA mutations flow through the
SECURITY DEFINER RPCs in `00004_rpc.sql`, which:

1. derive identity/org/role/approval from the JWT via `current_profile()` /
   `assert_active_ba()` (client-supplied values are ignored),
2. compute the Lagos date server-side,
3. recompute store distance with `distance_metres()` (haversine),
4. enforce business rules (geofence radius, one log/day, edit window,
   weekly off day, sick-leave exclusivity),
5. dedupe retries through `try_consume_receipt()` / `complete_receipt()`,
6. write `audit_logs`.

Internal helper functions are locked down: a hardening block revokes EXECUTE
from `public`/`anon`; RPCs are granted to `authenticated` selectively.

## Geofencing rules

- Default radius 200 m (per-store override in `stores.geofence_radius_metres`).
- Check-in outside the fence: always rejected.
- Checkout outside the fence: rejected unless the org enables
  `settings.allow_out_of_geofence_checkout = true`, in which case it is
  allowed but flagged.

## Storage

Buckets `profile-photos` and `daily-log-photos` are **private**. Object paths
follow `{organization_id}/{auth_user_id}/{uuid}.jpg`. Policies let users write
only inside their own folder while pending/approved, and admins read within
their organization. Clients render images exclusively through short-lived
signed URLs minted by the admin app.

## Regenerating types

```bash
cd supabase && supabase gen types typescript --local \
  > ../packages/database/src/database.types.ts
```
