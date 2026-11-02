# Maintenance & services — first version

Branch: `feature/maintenance-services`. Main and production remain unchanged.

## Workflow

1. Any approved member of an active organization reports an issue with title,
   location, description and priority.
2. An organization administrator (or super administrator in their active
   organization) assigns an approved non-client member, deadline and instructions.
   The service request becomes a work order.
3. That assigned technician starts work, records notes, reports a parts delay,
   resumes work and submits a completion summary.
4. A different administrator approves the work or reopens it with comments.
   A reopened order must be submitted again before it can be approved.

Statuses: requested → assigned → in_progress ↔ awaiting_parts → ready_for_review
→ completed. Review may return ready_for_review to in_progress. Completed work
is immutable in this first version.

Technician is a job assignment, not a new global account role. This preserves
existing accounts and retail permissions. Supervisors may be assigned as
technicians; only existing organization/super administrators dispatch and review.
Requesters see their own requests; technicians see assigned jobs as well as their
own requests; administrators see their active organization's jobs. No organization
switching or cross-company access is introduced. Existing org switching applies.

## Surfaces

- `/service-desk`: real authenticated workspace. Requires server environment
  variable `MAINTENANCE_ENABLED=true` and the maintenance schema on a test database.
- `/maintenance-preview`: fictional interactive simulator, only available on
  Vercel preview deployments with no Supabase URL configured. It does not call
  the mutation action or save data remotely. Refresh or Reset demo clears changes.
- Portal and brand-workspace navigation show a Service desk entry only when the
  maintenance server flag is enabled. A maintenance deep link works after login.

The dashboard shows the most recent 250 jobs visible to the caller. Summary
counts cover this loaded set, not a historical analytics report. Times use the
shared Africa/Lagos helpers, and deadline inputs explicitly use Lagos wall time.

## Backend and security

Migration: `20261102123815_maintenance_service_workflow.sql`, created with the
Supabase CLI. **Not applied to any hosted database.**

- `maintenance_jobs` and append-only `maintenance_events` both have RLS.
- Authenticated clients have SELECT only. No direct client insert/update/delete.
- Two narrowly granted RPCs: `maintenance_workspace` and `maintenance_mutate`.
- SECURITY DEFINER is necessary for the repository's RPC-only write pattern.
  Both functions use an empty search_path, fully qualified tables and a verified
  approved profile in an active organization; anonymous execute is revoked.
- Organization, actor, status, timestamps and approval authority are checked or
  derived in SQL. Assignees must be approved non-client members of the same org.
- Every successful mutation writes an event, audit log and operation receipt in
  the same transaction. Receipt IDs are locked and bound to actor, org and a
  command fingerprint. A replay cannot duplicate a job or event, and different
  payload/actor reuse is rejected. The UI reuses a receipt ID after an ambiguous
  failure of the same command.
- Version checks under row locks reject stale updates. Account/org row locks
  protect mutations against concurrent suspension. RPC rate limit is 60 new
  commands per user per five minutes; receipt replay does not consume a new slot.
- Approval requires a separate administrator; client and technician UI controls
  never authorize database writes. Draft form input is validated with Zod.
- RPC typings are authored alongside the migration. Regenerate them from the
  test database after the full migration chain is applied and before release.

## Verification

Run `pnpm --filter @fazoo/admin test`, `pnpm --filter @fazoo/admin typecheck`
and changed-file eslint. Database tests use pinned `@electric-sql/pglite`, an
isolated PostgreSQL WASM engine, without network calls or live credentials.
They execute the exact migration against minimal fixtures matching the referenced
core schemas, roles, current-profile helper, receipt and audit tables. The rate
limiter is stubbed in this fixture; it does not test the existing rate-limit SQL.

Coverage includes workflow transitions, real RLS and table grants, anonymous
rejection, cross-org visibility/mutations, unauthorized assignments, client and
foreign technician rejection, stale writes, same-ID replay, conflicting receipt
reuse, suspension, reopening and independent approval (including an admin who
is also the technician). Existing authentication tests run alongside these.

This is not a complete Supabase integration or concurrency test. Before enabling
for real users: apply the entire schema chain to an isolated Supabase project,
regenerate types, run advisors, verify real logins and organization switching,
exercise two concurrent technicians/dispatchers, verify rate limiting and run
browser acceptance on desktop and mobile. Keep production flag off until then.

## Deliberate first-version boundaries

Work notes, deadlines and review history are implemented. Photo/video evidence,
GPS check-ins, offline synchronization, technician onboarding/invites, customer
contracts, equipment registry, recurring schedules, parts inventory, billing,
email/SMS and push notifications are not included. No automated safety or repair
instructions are generated. Live or background location tracking is not added.

## Browser acceptance on the isolated preview

Verified request creation, assignment and Lagos deadline entry, switching to the
technician view, starting work, submitting a completion summary, switching back
to administrator, and approval to Completed. The event history retained every
step. This check used the browser-only simulator; hosted Supabase acceptance
and phone-device checks remain pending.
