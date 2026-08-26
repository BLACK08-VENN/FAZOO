# Production Supabase Configuration

This document covers the production setup for the Supabase project.
Run these steps after creating a project at https://supabase.com/dashboard.

## 1. Create the project

```bash
supabase projects create fazoo --region us-east-1
supabase link --project-ref YOUR_PROJECT_REF
```

## 2. Push migrations

```bash
cd supabase
supabase db push
```

## 3. Generate types

```bash
supabase gen types typescript --project-ref YOUR_PROJECT_REF > ../packages/database/src/database.types.ts
```

## 4. Configure Auth

In the Supabase dashboard → Authentication → Providers:

- **Email**: Enable email/password sign-ups
- **Redirect URLs**: Add your production admin URL:
  - `https://admin.yourdomain.com/overview`

In Authentication → URL Configuration:
- Site URL: `https://admin.yourdomain.com`
- Redirect URLs: `https://admin.yourdomain.com/**`

## 5. Configure Storage

Storage buckets are created by migrations. Verify in the dashboard:

- `daily-log-photos` — Private, 10MB limit, image/* only
- `profile-photos` — Private, 5MB limit, image/* only

No public buckets. All photo access goes through short-lived signed URLs.

## 6. Set environment variables

### Admin portal (Vercel)

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_SITE_URL=https://admin.yourdomain.com
```

### Mobile app (EAS)

```
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_APP_ENV=production
```

## 7. Enable RLS (already in migrations)

All tables have RLS enabled via `00003_rls.sql`. Verify in the dashboard:

```sql
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = false;
```

This should return zero rows.

## 8. Verify RPC functions

```sql
-- Should return the current user's profile
SELECT current_profile();

-- Should return distance between two Lagos coordinates (in metres)
SELECT distance_metres(6.5244, 3.3792, 6.6018, 3.3515);
```

## 9. Rate limiting

The `check_rate_limit` RPC enforces per-user rate limits on CSV exports.
Defaults are set in `packages/config/src/constants.ts`:

- `RATE_LIMIT_WINDOW_MS`: 60,000 (1 minute)
- `RATE_LIMIT_MAX`: 5 (5 requests per window)

Adjust in the database if needed:

```sql
UPDATE organizations
SET settings = settings || '{"rate_limit_window_ms": 120000, "rate_limit_max": 10}'::jsonb
WHERE slug = 'lenovo-nigeria';
```

## 10. Monitoring

- **Sentry**: Configure DSN in both admin and mobile env vars
- **Supabase Dashboard**: Monitor API usage, auth events, storage
- **Logs**: Available in Supabase dashboard → Logs
