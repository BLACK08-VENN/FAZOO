import {
  lagosDate,
  lagosDateTime,
  formatLagosDisplay,
  formatNairobiDisplay,
  weeklyOffDayName,
} from '@fazoo/config';

export { lagosDate, lagosDateTime, formatLagosDisplay, formatNairobiDisplay, weeklyOffDayName };

/** Shown wherever a milestone has not happened yet. */
export const NOT_YET = '—';

/**
 * The school programme runs on Africa/Nairobi (Veda's organization timezone),
 * not Lagos, so pipeline timestamps get their own formatter. Null-safe because
 * most milestones are absent until they happen — `formatNairobiDisplay` throws
 * on anything it cannot parse.
 */
export function nairobiTime(instant: string | null | undefined): string {
  if (!instant) return NOT_YET;
  try {
    return formatNairobiDisplay(instant);
  } catch {
    return NOT_YET;
  }
}

/** Date-only variant, for `visit_date` / `last_visit_date` columns. */
export function nairobiDate(isoDate: string | null | undefined): string {
  return isoDate || NOT_YET;
}

/** Google Maps link for a coordinate pair. */
export function mapsLink(lat: number | null, lng: number | null): string | null {
  if (lat === null || lng === null) return null;
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export function yesNo(value: boolean | null | undefined): 'yes' | 'no' {
  return value ? 'yes' : 'no';
}

export function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}
