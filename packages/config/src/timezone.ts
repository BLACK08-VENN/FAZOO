/**
 * Africa/Lagos timezone helpers.
 *
 * All timestamps are stored in UTC (timestamptz). Attendance grouping,
 * display and CSV formatting use Africa/Lagos (UTC+1, no DST).
 * These pure helpers mirror the SQL expressions used in migrations
 * (see supabase/migrations/00002_functions_triggers.sql) and are the ONLY
 * sanctioned way to compute attendance dates or format Nigerian times.
 */

export const FAZOO_TIMEZONE = 'Africa/Lagos' as const;
const LAGOS_OFFSET_MINUTES = 60; // UTC+01:00, no DST

/**
 * Returns the `YYYY-MM-DD` attendance date for a given instant in Lagos time.
 * Mirrors SQL `(t AT TIME ZONE 'Africa/Lagos')::date`.
 */
export function lagosDate(instant: Date | string = new Date()): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  if (Number.isNaN(d.getTime())) throw new RangeError('Invalid date');
  const shifted = new Date(d.getTime() + LAGOS_OFFSET_MINUTES * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Formats an instant as a Lagos wall-clock string, e.g. "2026-08-24 09:41".
 */
export function lagosDateTime(instant: Date | string): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  if (Number.isNaN(d.getTime())) throw new RangeError('Invalid date');
  const shifted = new Date(d.getTime() + LAGOS_OFFSET_MINUTES * 60_000);
  return shifted.toISOString().slice(0, 16).replace('T', ' ');
}

/** Locale-aware display, e.g. "24 Aug 2026, 09:41" in Lagos time. */
export function formatLagosDisplay(
  instant: Date | string,
  locale = 'en-NG',
): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  if (Number.isNaN(d.getTime())) throw new RangeError('Invalid date');
  return new Intl.DateTimeFormat(locale, {
    timeZone: FAZOO_TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

/**
 * Day-of-week for the Lagos calendar date. 0 = Sunday … 6 = Saturday,
 * matching the `weekly_off_day` convention stored on assignments.
 */
export function lagosDayOfWeek(instant: Date | string = new Date()): number {
  const iso = lagosDate(instant);
  const [y, m, day] = iso.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, day)).getUTCDay();
}

/** Human weekday names indexed by the 0–6 Sunday-first convention. */
export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export function weeklyOffDayName(day: number): string {
  return WEEKDAY_NAMES[day] ?? 'Unknown';
}

/** Locale-aware display for Veda (Africa/Nairobi) wall-clock times. */
export function formatNairobiDisplay(
  instant: Date | string,
  locale = 'en-KE',
): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  if (Number.isNaN(d.getTime())) throw new RangeError('Invalid date');
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'Africa/Nairobi',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}
