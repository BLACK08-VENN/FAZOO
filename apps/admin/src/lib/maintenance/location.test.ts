import { describe, expect, it, vi } from 'vitest';
import { captureLocation, locationMapUrl, manualPin, pinSchema } from './location';
import { byPriority } from './model';
import { initialDemo } from './demo';

describe('Precise job locations and priority', () => {
  it('requires both valid manual coordinates and never claims measured precision', () => {
    expect(manualPin('', '')).toBeNull();
    expect(() => manualPin('1', '')).toThrow();
    expect(() => manualPin('91', '1')).toThrow();
    const pin = manualPin(String(Math.random() * 80), String(Math.random() * 170));
    expect(pin?.source).toBe('manual');
    expect(pin?.accuracy_m).toBeNull();
  });
  it('requires GPS accuracy and capture time', () => {
    const base = {
      latitude: Math.random() * 80,
      longitude: Math.random() * 170,
      source: 'gps',
      accuracy_m: null,
      captured_at: null,
    };
    expect(pinSchema.safeParse(base).success).toBe(false);
    expect(
      pinSchema.safeParse({ ...base, accuracy_m: 12, captured_at: new Date().toISOString() })
        .success,
    ).toBe(true);
  });
  it('requests high accuracy without accepting a cached location', async () => {
    const latitude = Math.random() * 80,
      longitude = Math.random() * 170;
    const getCurrentPosition = vi.fn<Geolocation['getCurrentPosition']>((success) =>
      success({
        coords: { latitude, longitude, accuracy: 125 },
        timestamp: Date.now(),
      } as GeolocationPosition),
    );
    const pin = await captureLocation({ getCurrentPosition });
    expect(pin.accuracy_m).toBe(125);
    expect(pin.latitude).toBe(latitude);
    expect(getCurrentPosition.mock.calls[0]?.[2]).toEqual({
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0,
    });
  });
  it('handles permission denial and timeouts without manufacturing a location', async () => {
    for (const code of [1, 3]) {
      const geo = {
        getCurrentPosition: (
          _success: PositionCallback,
          error?: PositionErrorCallback | null,
        ) => error?.({ code } as GeolocationPositionError),
      };
      await expect(captureLocation(geo)).rejects.toThrow(code === 1 ? /declined/ : /timed out/);
    }
  });
  it('rejects invalid device timestamps', async () => {
    const geo = {
      getCurrentPosition: (success: PositionCallback) =>
        success({ coords: {}, timestamp: NaN } as GeolocationPosition),
    };
    await expect(captureLocation(geo)).rejects.toThrow(/timestamp/);
  });
  it('links to the actual pin and sorts urgent jobs ahead of routine jobs', () => {
    const pin = manualPin(String(Math.random() * 80), String(Math.random() * 170))!;
    expect(locationMapUrl(pin)).toContain(
      encodeURIComponent(`${pin.latitude},${pin.longitude}`),
    );
    expect(locationMapUrl(pin, true)).toContain('/dir/');
    const jobs = initialDemo().jobs.sort(byPriority);
    expect(jobs.map((j) => j.priority)).toEqual(['urgent', 'high', 'normal', 'low']);
  });
});
