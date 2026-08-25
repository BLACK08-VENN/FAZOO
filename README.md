# Fazoo

Field-force management and sales-reporting platform. Brand Ambassadors check
in at retail stores within a GPS geofence, photograph stock, record SKU sales
and check out; administrators manage people, places, campaigns and reports.
First client: **Lenovo Nigeria** — every tenant lives in `organizations`.

| Workspace | Stack |
| --- | --- |
| `apps/admin` | Next.js (App Router), Tailwind CSS 4, shadcn-style UI, Recharts, TanStack Table |
| `apps/mobile` | Expo SDK 57, expo-router, NativeWind, expo-location/image-picker/sqlite |
| `packages/*` | types · validation (Zod) · database (Supabase) · config · ui tokens |
| `supabase/` | SQL migrations with RLS + SECURITY DEFINER RPCs, seed data |

## Quick start

```bash
pnpm install
cp .env.example .env            # fill in Supabase URL + keys (placeholders only in git)
pnpm typecheck && pnpm test     # verify toolchain

# Local Supabase stack (requires https://supabase.com/docs/guides/cli)
cd supabase && supabase start && supabase db reset
```

Full instructions: [docs/setup.md](./docs/setup.md).
Architecture: [docs/architecture.md](./docs/architecture.md).

## Scripts

```bash
pnpm dev:admin    # admin portal on http://localhost:3000
pnpm dev:mobile   # Expo dev server
pnpm typecheck    # strict TS across all workspaces
pnpm lint         # ESLint flat config
pnpm test         # Vitest unit tests
```

## Security model in one paragraph

Credentials live only in Supabase Auth. All BA/admin mutations run through
SECURITY DEFINER Postgres functions that derive identity from the JWT,
recompute Lagos attendance dates and geofence distances server-side, enforce
business rules, write audit logs and record idempotency receipts for offline
retries. Row-Level Security protects every table and both private photo
buckets; photographs render exclusively through short-lived signed URLs.
