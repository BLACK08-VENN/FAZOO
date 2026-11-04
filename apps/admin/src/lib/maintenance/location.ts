import { z } from 'zod';

export const pinSchema = z
  .object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    source: z.enum(['gps', 'manual']),
    accuracy_m: z.number().finite().positive().max(100000).nullable(),
    captured_at: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict()
  .refine(
    (pin) =>
      pin.source === 'gps'
        ? pin.accuracy_m !== null && pin.captured_at !== null
        : pin.accuracy_m === null && pin.captured_at === null,
    {
      message:
        'GPS pins need a measured accuracy and capture time; manual pins cannot claim GPS accuracy.',
    },
  );
export type LocationPin = z.infer<typeof pinSchema>;
export function manualPin(latitude: string, longitude: string): LocationPin | null {
  if (!latitude.trim() && !longitude.trim()) return null;
  if (!latitude.trim() || !longitude.trim())
    throw new Error('Enter both latitude and longitude, or use current GPS location.');
  return pinSchema.parse({
    latitude: Number(latitude),
    longitude: Number(longitude),
    source: 'manual',
    accuracy_m: null,
    captured_at: null,
  });
}
export function locationMapUrl(pin: LocationPin, directions = false) {
  const query = encodeURIComponent(`${pin.latitude},${pin.longitude}`);
  return directions
    ? `https://www.google.com/maps/dir/?api=1&destination=${query}`
    : `https://www.google.com/maps/search/?api=1&query=${query}`;
}
export function captureLocation(
  geo: Pick<Geolocation, 'getCurrentPosition'>,
): Promise<LocationPin> {
  return new Promise((resolve, reject) => {
    geo.getCurrentPosition(
      (position) => {
        if (
          !Number.isFinite(position.timestamp) ||
          !Number.isFinite(new Date(position.timestamp).getTime())
        ) {
          reject(
            new Error('The device returned an invalid location timestamp. Try a new reading.'),
          );
          return;
        }
        const parsed = pinSchema.safeParse({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy_m: position.coords.accuracy,
          captured_at: new Date(position.timestamp).toISOString(),
          source: 'gps',
        });
        if (!parsed.success) {
          reject(
            new Error(
              'The device returned an invalid location. Try again or enter a pin manually.',
            ),
          );
          return;
        }
        resolve(parsed.data);
      },
      (error) =>
        reject(
          new Error(
            error.code === 1
              ? 'Location permission was declined. Enter the site address and paste a location pin manually.'
              : error.code === 3
                ? 'The location request timed out. Try again near an open area or enter a pin manually.'
                : 'Your location is unavailable. Enter the site address and a manual pin instead.',
          ),
        ),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  });
}
