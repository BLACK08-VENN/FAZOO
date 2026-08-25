/**
 * Geodesic helpers. The database is authoritative for distance checks
 * (SQL function `distance_metres`); this TypeScript twin exists for
 * client-side pre-flight UX (e.g. showing "you are 34 m away" before the
 * server validates). Both implementations must agree — covered by tests.
 */

const EARTH_RADIUS_M = 6_371_008.8;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Haversine great-circle distance in metres between two WGS84 points.
 */
export function distanceMetres(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const φ1 = toRadians(lat1);
  const φ2 = toRadians(lat2);
  const Δφ = φ2 - φ1;
  const Δλ = toRadians(lng2 - lng1);

  const a =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function isWithinGeofence(
  lat: number,
  lng: number,
  storeLat: number,
  storeLng: number,
  radiusMetres: number,
): boolean {
  return distanceMetres(lat, lng, storeLat, storeLng) <= radiusMetres;
}
