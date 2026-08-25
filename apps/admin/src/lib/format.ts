import { lagosDate, lagosDateTime, formatLagosDisplay, weeklyOffDayName } from '@fazoo/config';

export { lagosDate, lagosDateTime, formatLagosDisplay, weeklyOffDayName };

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
