/**
 * Shared business constants. Values here must stay in sync with the SQL
 * defaults in supabase/migrations/00001_schema.sql — the database remains
 * the source of truth; these exist for client-side UX and validation.
 */

/** Default geofence radius when a store has no explicit value. */
export const DEFAULT_GEOFENCE_RADIUS_METRES = 200;

export const MIN_GEOFENCE_RADIUS_METRES = 20;
export const MAX_GEOFENCE_RADIUS_METRES = 2_000;

/** GPS acquisition limits on mobile. */
export const GPS_TIMEOUT_MS = 15_000;
export const GPS_TARGET_ACCURACY_M = 50;

/** Photograph constraints (registration + daily-log photos). */
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
export const PHOTO_ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Password policy mirrored by Zod in packages/validation. */
export const PASSWORD_MIN_LENGTH = 10;

/** Storage buckets. Private by policy; signed URLs only. */
export const BUCKET_PROFILE_PHOTOS = 'profile-photos';
export const BUCKET_DAILY_LOG_PHOTOS = 'daily-log-photos';

/** Auth identity alias domain for phone-number sign-in (see docs/architecture.md). */
export const BA_EMAIL_ALIAS_DOMAIN = 'ba.fazoo.app';

/** CSV export safety rails. */
export const CSV_EXPORT_MAX_ROWS = 100_000;

/** Rate limits (windowed). */
export const RATE_LIMIT_SIGNIN_MAX = 10;
export const RATE_LIMIT_SIGNIN_WINDOW_S = 300;
export const RATE_LIMIT_EXPORT_MAX = 12;
export const RATE_LIMIT_EXPORT_WINDOW_S = 600;

/**
 * Organization settings shape stored in organizations.settings jsonb.
 */
export interface OrganizationSettings {
  /** true → checkout outside geofence is allowed but flagged; false → blocked. */
  allow_out_of_geofence_checkout: boolean;
}

export const DEFAULT_ORGANIZATION_SETTINGS: OrganizationSettings = {
  allow_out_of_geofence_checkout: false,
};
