# Mobile release checklist

## Required environment

Set Expo/EAS secrets for `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
and `EXPO_PUBLIC_SENTRY_DSN`. The Sentry DSN is a public ingestion identifier; never
put a Sentry auth token, Supabase service-role key, or signing credential in an
`EXPO_PUBLIC_*` variable.

Add `fazoo://update-password` to the Supabase Auth redirect allow-list. Configure
the production HTTPS app-link equivalent before store submission.

## Verification

1. Run `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
2. Run `supabase start && supabase db reset`.
3. Run `psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_rpc.sql`.
4. Build development clients with `eas build --profile development --platform all`.
5. Execute every flow in `apps/mobile/maestro` on Android and iOS.
6. Confirm location/camera denial, airplane-mode check-in, app termination during
   upload, recovery-link expiry, duplicate taps, and post-checkout sale locking.
7. Confirm a test crash appears in the correct Sentry environment without PII.

## Distribution

Use the preview profile for internal acceptance and production only after the
database/RLS and physical-device checks pass. Store signing credentials remain in
EAS-managed credential storage. Complete the privacy policy, data-safety forms,
permission disclosures, screenshots, support URL, and Nigerian store metadata
before submission.
