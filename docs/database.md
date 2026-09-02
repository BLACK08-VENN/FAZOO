# Database

Everything lives in ordered SQL migrations under `supabase/migrations/`:

| File | Contents |
| --- | --- |
| `00001_schema.sql` | enums, tables, constraints, indexes, private storage buckets |
| `00002_functions_triggers.sql` | helpers, triggers, audit plumbing |
| `00003_rls.sql` | row-level security policies (tables + storage) |
| `00004_rpc.sql` | SECURITY DEFINER RPCs, grants, rate limiting |
| `00005_idempotent_sale_edits.sql` | sale create/update/delete RPCs (idempotent) |
| `00006_grants.sql` | staged RPC grants |
| `00007_client_role.sql` | client-role plumbing |
| `00008_leave_requests.sql` | leave requests (per assignment) |
| `00009_organization_memberships.sql` | org membership + provisioning |
| `00010_veda_schema.sql` | Veda school schema (schools, sessions, stationery) |
| `00011_service_role_grants.sql` | service-role grants |
| `00012_assignments_org_scope.sql` | org-scoped assignments |
| `00013_add_brand_setup.sql` | brand onboarding / `create_brand` |
| `00014_brand_logos.sql` | brand logo storage |
| `00015_checkout_photos.sql` | checkout photos |
| `00016_checkout_photo_requirement.sql` | checkout photo policy |
| `00017_ba_web_history.sql` | BA web history |
| `00018_rls_helper_grants.sql` | helper grants |
| `00019_fix_rate_limiter.sql` | rate-limiter fix |
| `00020_storage_buckets.sql` | storage buckets |
| `00021_ba_my_campaigns.sql` | BA "my campaigns" RPC |
| `00022_veda_activation.sql` | Veda activation (sessions, check-in/out, admin) |
| `00023_fix_is_org_admin.sql` | org-admin helper fix |
| `00024_admin_ba_management.sql` | admin BA create/assign management |
| `00025_multi_off_days_and_assignments.sql` | array off-days + multi-assignment (`ba_today`/`veda_today` → `assignments[]`, per-assignment RPCs) |

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
- `brand_ambassador_assignments` — BA ↔ campaign ↔ store with an *array*
  of weekly off days `weekly_off_day smallint[]` (`0=Sunday … 6=Saturday`,
  NOT NULL, `'{}'` default). A BA may hold **several simultaneous** active
  assignments; attendance is recorded per assignment. `veda_assignments`
  mirror this for school visits (off-day column nullable).
- `normalize_off_days(smallint[])` — validates (0–6), dedupes, and normalizes
  an off-day array; used by every assignment RPC.
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
2. compute the Lagos/Nairobi date server-side,
3. recompute store/school distance with `distance_metres()` (haversine),
4. enforce business rules (geofence radius, one log/day, edit window,
   per-assignment weekly off day, sick-leave exclusivity),
5. dedupe retries through `try_consume_receipt()` / `complete_receipt()`,
6. write `audit_logs`.

BA today/check-in/check-out/sick-leave/leave and veda equivalents accept a
`p_assignment_id` (or `p_daily_log_id` for checkout/sales) so a BA on several
active assignments targets the exact one; `ba_today()`/`veda_today()` return an
`assignments[]` array, one element per active assignment.

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
