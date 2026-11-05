# Daily logistics and operations

Implemented on `feature/maintenance-services`; no production database changes.

## Use

- `/operations`: authenticated operations workspace, enabled only with the server-side
  `OPERATIONS_ENABLED=true`. Default is off, independent of `MAINTENANCE_ENABLED`.
- `/maintenance-preview/operations`: interactive fictional sample for credential-free
  Vercel previews. No remote reads, writes, uploads or persistence. The service desk
  preview links to it. Switch between operations manager and field staff to exercise
  allocation, execution, issue reporting and independent completion review.
- Main and production must remain unchanged. Do not apply the migration to the live
  Supabase project as part of a branch preview.

Administrators allocate a task, delivery, collection or setup to an approved worker
in their current organization. A campaign, location, future Lagos-time deadline,
priority and instructions are required. Deliveries and collections also require an
origin and expected item quantities. Campaigns must be active when allocating.
Existing tasks remain available for follow-up when a campaign closes.

The assigned worker starts work, records progress, reports a blocking issue and
resumes before submitting completion. Delivery/collection completion requires
actual item quantities and a recipient name recorded by the worker. This is a
staff-recorded acknowledgement, not a verified recipient signature. Actual quantities
may differ from expected; notes and both sets of quantities remain visible for review.

Up to four JPG/PNG/WebP completion photos, 5 MB each, can be attached. Private
objects are uploaded under organization/campaign/task paths. The mutation verifies
that each referenced object exists in that task's path. Review links expire after five
minutes; refresh to obtain new links. Unsubmitted upload objects remain private;
a retention/orphan cleanup policy must be agreed before a production rollout.

A separate administrator approves submitted work or returns it for follow-up with
comments. Administrators assigned to a task cannot approve their own completion.
Completed records are immutable. Assigned or blocked work may be reassigned with
a new future deadline. This revokes the previous worker's task access and clears
completion fields while preserving activity history.

Daily due-date, campaign and status filters support a daily workload overview.
Date boundaries use shared Africa/Lagos helpers. Counts cover up to 250 recent
accessible tasks and follow date/campaign selection; the interface states this limit.
This is not an exhaustive historical analytics report or background GPS tracker.

## Access and data boundaries

- Organization ID and actor come from the approved authenticated profile in an
  active organization. The client cannot choose another organization.
- Only organization/super administrators allocate and review tasks in their current
  organization. A super administrator must explicitly switch organization first.
- Field workers and supervisors see their own assignments only. Clients cannot
  access operations. Staff directories are returned only to managers in that org.
- Every task requires a campaign belonging to the same organization. Display and
  mutation queries enforce that relation; campaign filters never broaden access.
- New tables have RLS and authenticated SELECT-only grants. All writes use guarded
  RPCs. Events are append-only; successful commands atomically write audit logs,
  version changes and actor/org/payload-bound idempotency receipts. Row/advisory
  locks prevent stale updates and duplicate retry effects. Rate limiter: 60 new
  commands per user per five minutes; valid replays do not consume another slot.
- Storage is private. Read/upload policies use current task access; uploads are
  restricted to the assigned worker while work is in progress or blocked. There
  are no replacement/delete policies. No service-role key is used by the UI.

## Verification and activation

Migration created with pinned Supabase CLI v2:
`20261105130826_daily_operations_tracking.sql`. Not applied to hosted databases.
RPC typings are authored with the migration; regenerate from the isolated Supabase
project after applying its complete migration chain, before any real deployment.

Run admin typecheck, lint and Vitest. Operations tests execute the exact migration
in isolated PGlite with minimal core/storage fixtures. They test real SQL/RLS/grants,
organization/campaign isolation, client/anonymous rejection, ownership, retries,
stale writes, lifecycle, quantities, recipient acknowledgement, evidence references,
private object policies, suspension and independent review. This fixture stubs the
existing rate limiter and does not emulate the Supabase Storage HTTP service.

Before enabling real users, apply all migrations to a separate Supabase test project,
run advisors, verify Storage MIME/size enforcement and signed links with real JWTs,
check concurrent dispatch/update behavior, test photo upload retry on a phone, and
exercise organization switching using real sessions. Keep production flag off.
The preview's fictional browser workflow does not establish live Supabase readiness.

First version does not implement fleet routing, warehouse balances, stock valuation,
procurement, billing, background tracking, offline sync, recipient signatures, recurring
schedules or operations-specific notifications. Blocked tasks surface in the dashboard
and event history. Existing maintenance and merchandising workflows remain separate.
