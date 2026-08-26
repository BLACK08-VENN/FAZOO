# Deployment Guide

## Admin Portal (Vercel)

### Prerequisites
- Vercel account linked to GitHub
- Supabase production project created

### Steps

1. **Import repository**
   - Go to vercel.com/new
   - Import the GitHub repository
   - Framework: Next.js (auto-detected)

2. **Configure build**
   - Root Directory: `apps/admin`
   - Build Command: `cd ../.. && pnpm install && pnpm --filter @fazoo/admin build`
   - Install Command: `cd ../.. && pnpm install`
   - Output Directory: `.next`

3. **Set environment variables**
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   NEXT_PUBLIC_SITE_URL=https://admin.yourdomain.com
   ```

4. **Deploy**
   - Push to main branch
   - Vercel auto-deploys

5. **Custom domain**
   - Go to Project Settings → Domains
   - Add `admin.yourdomain.com`
   - Update DNS records as instructed

### Post-deploy verification

```bash
# Check the site loads
curl -I https://admin.yourdomain.com/sign-in

# Verify security headers
curl -I https://admin.yourdomain.com/sign-in | grep -i "strict-transport\|x-frame\|x-content-type"
```

## Mobile App (EAS)

### Prerequisites
- Expo account (`eas login`)
- Apple Developer account (iOS)
- Google Play Console account (Android)

### Steps

1. **Configure EAS**
   - `eas.json` is already configured with development/preview/production profiles

2. **Build for preview (internal testing)**
   ```bash
   cd apps/mobile
   eas build --profile preview --platform ios
   eas build --profile preview --platform android
   ```

3. **Build for production**
   ```bash
   eas build --profile production --platform ios
   eas build --profile production --platform android
   ```

4. **Submit to app stores**
   ```bash
   eas submit --profile production --platform ios
   eas submit --profile production --platform android
   ```

### iOS-specific

- Ensure `appleId` and `ascAppId` are configured in `eas.json` submit section
- App Store Connect team must be configured
- Provisioning profiles managed by EAS

### Android-specific

- Ensure `serviceAccountKeyPath` is configured in `eas.json` submit section
- Google Play service account JSON required
- Internal track for testing, production track for release

## Environment Variables Summary

| Variable | Admin | Mobile | Required |
|----------|-------|--------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✓ | | ✓ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✓ | | ✓ |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | | ✓ |
| `NEXT_PUBLIC_SITE_URL` | ✓ | | ✓ |
| `EXPO_PUBLIC_SUPABASE_URL` | | ✓ | ✓ |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | | ✓ | ✓ |
| `EXPO_PUBLIC_APP_ENV` | | ✓ | ✓ |
| `EXPO_PUBLIC_SENTRY_DSN` | | ✓ | Optional |

## Rollback

### Admin
- Vercel supports instant rollback to any previous deployment
- Go to Project → Deployments → click "..." → "Promote to Production"

### Mobile
- OTA updates via `expo-updates` for JS-only changes
- For native changes, submit a new build through EAS
- Previous build remains on device until user updates
