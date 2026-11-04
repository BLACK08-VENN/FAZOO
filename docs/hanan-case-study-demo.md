# Hanan case-study demonstration

Branch: feature/maintenance-services. Route: /maintenance-preview/hanan.

This is a fictional, unaffiliated case-study demonstration. Hanan has not been
onboarded as a tenant. Sample outlets, products, staff, prices, stock quantities
and equipment are invented. No brand logo, real business records, GPS coordinates,
supplier connection, payment flow or company integration is included.

## Interactive scope

- Shelf checks: unit count, KES shelf price, display checklist, notes and optional
  local JPEG evidence. Zero-stock checks open or link an active product/outlet gap.
- Stock gaps: labelled priority, manager-assigned deadline, field-worker follow-up,
  independent simulated manager review, return for further work and resolution.
- Orders: standalone or linked replenishment requests; requested, approved,
  dispatched, received. Receipt does not prove shelf replenishment or close a gap.
- Competitor intelligence: fictional competitor labels, category, price, promotion
  and capture timestamp.
- Equipment: register an asset and recurring interval, assign service, start,
  submit and independently approve; approval schedules the next service interval
  from approval time and retains history.
- Offline demonstration: queued operations and compressed photos are persisted
  in versioned browser localStorage. Network events and an explicit simulation
  toggle determine queue mode. Sync replays operations against the local model
  using immutable operation IDs. Replays do not duplicate records; reuse with a
  different role or command fails. Queued operations retain their demo actor.
  A conflicting head entry stops replay and stays visible for discard/retry.
  No server upload occurs. Cold-start offline page loading is not guaranteed.
- Dashboard: counts, locally generated action alerts and dated event history.

All actions run against one browser-local demo workspace. Preview role switching
illustrates the workflow; it is not production authorization or tenant isolation.
A new deployment has a separate origin and therefore separate saved demo data.
Browser storage failures prevent acceptance and display an error. The queue is
limited to 20 entries; collections and receipt history are bounded. Reset requires
confirmation and clears only the demo's own storage key. Photos must be JPEG/PNG/
WebP under 5 MB, are scaled to at most 800px and converted to a bounded JPEG data
URL before storage. Only fictional demonstration photos should be used.

## Deployment boundary

The server page only renders for a credential-free Vercel preview. Existing
proxy public-path handling already covers nested /maintenance-preview routes.
Main, production environment variables, Supabase schemas, existing tenant data,
brand analytics and authenticated routes are unchanged. The demo is not an
alternative login or a claim of production-ready retail/offline functionality.

## Verification

Model tests cover automatic gap creation/deduplication, operation replay and ID
conflicts, immutable state, roles, deadlines, review/reopen, order matching and
transitions, independent service approval, recurring scheduling and invalid data.
Vercel builds check TypeScript and compile the actual route.
Real server authorization, RLS, private storage, push/email notifications, ERP
integration, real offline synchronization and multi-device acceptance belong to
the later production implementation. No hosted database migration is included.
