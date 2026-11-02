# Unified web sign-in

## Behavior

- One email-or-phone and password form; no public account-type selector.
- The existing phone alias mapping is preserved for current accounts.
- Verified database profiles determine destinations: staff to `/overview`,
  clients and BAs to `/brand`; unapproved or missing profiles to `/account-status`.
- Valid Supabase cookie sessions are restored automatically. Refresh/clear cookies
  survive proxy redirects, and dynamic responses are marked private/no-store.
- Existing rate limits, page guards, organization permissions and RLS remain.
- Password visibility and browser password-manager autocomplete are supported.
- Recovery is administrator-assisted; the help page does not claim to send reset
  emails. No public privileged-role registration or new invitation system is added.

## Verification

Run `pnpm --filter @fazoo/admin test` for the 62 mocked authentication, routing,
and session-proxy checks. Run `pnpm --filter @fazoo/admin typecheck` as well.
The auth tests have no real Supabase connection and never use production accounts.

At implementation, changed-file lint and TypeScript checks pass. Whole-admin lint
has four existing explicit-any errors in OCR files. The dependency audit also
fails on the unchanged baseline lockfile (including Next.js advisories). These
are release blockers to review separately, not evidence of a production-ready build.

## Preview isolation and remaining acceptance checks

The separate `fazoo-expansion-preview` Vercel project has no database credentials.
It renders the new UI and help page, but disables credential submission explicitly.
The selected dark-glass design and unified sign-in are approved for main and
production deployment. Existing production authentication configuration is retained.
The access-request migration remains unapplied and submission stays disabled.

For full end-to-end authentication acceptance checks, provision a separate test Supabase environment,
apply the existing schema there and create fictional approved/pending users.
Configure only that test project's public URL/key and server-side service key.
Verify real sign-in and sign-out for every role, pending-account approval,
refresh-token expiry/renewal, browser restart, and two-user organization isolation.
Do not point the preview at production for these checks.

## Collapsible access applications and current theme

The sign-in page now uses the supplied plum (#600053) and navy (#0A1A3A) theme.
A closed-by-default Request access section explains the three requestable roles:
Brand Ambassador, Client / Brand Representative and Supervisor. It collects name,
contact details and a typed organization name. No password, auth user, membership
or permission is created. Administrator access remains invitation-only.

The intake action validates and normalizes details, rate-limits hashed IP/contact
keys and writes only through the service-role-only `submit_access_request` RPC.
Anonymous retry receipts live on `access_requests.client_request_id` because the
existing BA operation receipts require a known profile and organization. Reusing
an ID with different details is rejected by the prepared database function.

Migration `20261030151252_access_requests_intake.sql` is prepared, not applied.
It enables RLS, denies public writes and limits reads to approved platform admins.
The new RPC type is updated from the authored migration; regenerate database types
when this schema is applied to the test project. No production migration was run.

Submission is gated server-side by `ACCESS_REQUESTS_ENABLED=true`; leave it false
until the migration, RLS, duplicate retries and stored records are tested on the
separate test database. The preview has no database and cannot accept applications.
A platform review/invitation interface is not implemented in this change; do not
claim this form automatically approves requests or sends notifications.

## Production rollout

Targeted authentication tests (62), validation tests (60) and admin TypeScript
checks pass. Real-account end-to-end acceptance remains unverified; no user
credentials are used by deployment checks. Existing dependency audit and whole-repo
lint findings remain outstanding. The selected UI uses the supplied gold-purple
monogram and enhanced 2160×3840 neon-wave background with dark glass surfaces.

Production retains its existing Supabase credentials and database. No migration
is applied in this rollout. `ACCESS_REQUESTS_ENABLED` is absent in production,
so the server rejects intake submissions and the page directs users to their
organization administrator instead.
