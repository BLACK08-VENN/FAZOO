# Setup

## Prerequisites

- Node.js ≥ 20.9 (developed on 24.x) and pnpm 11.x (`corepack enable`)
- Supabase CLI for local database work:
  `brew install supabase/tap/supabase`
- For mobile: an iOS simulator / Android emulator, or the Expo Go app
- For admin E2E smoke tests: `pnpm dlx playwright install`

## 1. Bootstrap

```bash
pnpm install
```

## 2. Environment variables

Copy the example envs — never commit real values:

```bash
cp .env.example .env              # shared/service placeholders (optional)
cp apps/admin/.env.example apps/admin/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | admin | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | admin | anon key (RLS applies) |
| `SUPABASE_SERVICE_ROLE_KEY` | admin | **server-only**, bypasses RLS; used solely by rate-limited service routes |
| `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` | mobile | same project, anon key only |

The service-role key must never appear in client bundles or logs.

## 3. Local Supabase stack

```bash
cd supabase
supabase start          # Postgres :54322, Studio :54323, Auth/REST :54321
supabase db reset       # applies supabase/migrations/*.sql then seed.sql
```

`seed.sql` creates fictitious demo data only:

- Org **Lenovo Nigeria (Demo)** (`lenovo-nigeria`)
- Accounts (passwords are documented in the seed file header):
  - `super@demo.fazoo.app` / `Demo-Super1!` — super admin
  - `admin@demo.fazoo.app` / `Demo-Admin1!` — org admin
  - supervisor + three BA accounts (phone alias identities)
- One campaign, three Lagos stores, four SKUs, assignments, scopes

Sign-in on both apps uses **mobile numbers** for BAs; demo staff accounts sign
in with their e-mail addresses.

### Regenerating database types

After any migration change:

```bash
cd supabase && supabase gen types typescript --local \
  > ../packages/database/src/database.types.ts
```

(The committed file is hand-written to match the migrations until the first
live project exists; regenerating replaces it with canonical output.)

## 4. Run the apps

```bash
pnpm dev:admin    # Next.js → http://localhost:3000
pnpm dev:mobile   # Expo dev server (press i / a)
```

## 5. Quality gates

```bash
pnpm typecheck    # tsc across every workspace
pnpm lint         # eslint flat config
pnpm test         # vitest unit tests
pnpm format       # prettier
```

Admin E2E (requires a running local stack):

```bash
cd apps/admin && npx playwright test
```

Mobile E2E (Maestro flows, device/emulator required):

```bash
maestro test apps/mobile/maestro/sign-in.yaml
maestro test apps/mobile/maestro/daily-cycle.yaml
```

## 6. Deploying to production

1. Create a **new** dedicated Supabase project (never reuse another product's).
2. `supabase db push` to apply migrations; load `seed.sql` only into non-prod.
3. Configure auth redirect URLs for the admin domain.
4. Storage buckets are created private by migrations; no public buckets exist.
5. Set env vars in Vercel (admin) and EAS secrets (mobile).

See also: [database.md](./database.md),
[roles-and-permissions.md](./roles-and-permissions.md),
[architecture.md](./architecture.md).
