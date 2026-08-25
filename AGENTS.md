# AGENTS.md — working agreement for this repository

## What Fazoo is

Multi-tenant field-force management platform. Brand Ambassadors check in at
stores (GPS geofence), photograph stock, record SKU sales, check out.
Admins manage BAs, stores, campaigns, reports. First client: Lenovo Nigeria,
but all data is scoped to `organizations`.

## Non-negotiable rules

1. **Never commit secrets.** `.env` files are gitignored; only `.env.example`
   placeholders may be committed. Never log keys, passwords or signed URLs.
2. **No password columns.** Auth lives in Supabase Auth exclusively.
3. **Never trust the client.** Organization id, BA id, role, approval status,
   attendance date, timestamps, distances — all derived or verified server-side
   in Postgres functions/RLS. Client values are hints, not facts.
4. **RLS everywhere.** Any new table gets RLS + policies before merge. Storage
   stays private; photos render through short-lived signed URLs only.
5. **Mutations via RPCs.** BA and admin mutations go through the SECURITY
   DEFINER functions in `supabase/migrations/*_rpc.sql`, which enforce
   business rules and write `audit_logs`.
6. **Idempotency for offline retries.** New client-triggered operations must
   accept a `client_request_id` and record an `operation_receipts` row.
7. **Africa/Lagos for dates.** Store UTC; compute attendance dates with
   `(now() AT TIME ZONE 'Africa/Lagos')::date`; format with
   `packages/config/src/timezone.ts`. Never hard-code BA names, stores or GPS
   coordinates anywhere.
8. **No legacy patterns.** No phpinfo, no unauthenticated export/cleanup
   endpoints, no CORS `*` on data endpoints, no historical personal data in
   dev/seed (fictitious names only).

## Layout

```
apps/admin       Next.js 16 portal (App Router, Tailwind 4)
apps/mobile      Expo SDK 57 app (expo-router, NativeWind)
packages/config  constants, timezone helpers, design tokens
packages/types   shared domain types
packages/validation  Zod schemas + phone/date utilities
packages/database    Supabase client factories + database types
supabase/        migrations (ordered), seed.sql, config.toml
docs/            architecture.md, database.md, roles-and-permissions.md,
                 setup.md, implementation-plan.md
```

## Commands

```bash
pnpm install            # bootstrap
pnpm typecheck          # tsc across all workspaces
pnpm lint               # eslint flat config
pnpm test               # vitest unit tests
pnpm dev:admin          # Next.js on :3000
pnpm dev:mobile         # Expo dev server

# Supabase (requires CLI: brew install supabase/tap/supabase)
cd supabase && supabase start           # local stack
supabase db reset                       # apply migrations + seed.sql
supabase gen types typescript --local > ../packages/database/src/database.types.ts
supabase db push                        # deploy migrations to remote project
```

## Conventions

- TypeScript strict; `type` imports use `import type`.
- Server-only code in admin lives under route handlers or files importing
  `server-only`; anything touching `SUPABASE_SERVICE_ROLE_KEY` must sit behind
  a session + role check and be rate-limited.
- Admin UI: shadcn-style components in `apps/admin/src/components/ui`;
  purple/black identity tokens from `packages/ui`.
- Mobile: one-hand reachability, large targets, visible offline/sync states;
  status never conveyed by colour alone.
- Tests live next to sources as `*.test.ts` (Vitest).
