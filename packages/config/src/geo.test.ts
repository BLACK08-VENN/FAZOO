import { describe, expect, it } from 'vitest';
import { distanceMetres, isWithinGeofence } from './geo';

// Lagos Island reference points (public generic locations used only as math fixtures)
const MOCK_A = { lat: 6.4531, lng: 3.3958 };
const MOCK_B = { lat: 6.4540, lng: 3.3958 };

describe('distanceMetres', () => {
  it('returns ~0 for identical points', () => {
    expect(
      distanceMetres(
        MOCK_A.lat,
        MOCK_A.lng,
        MOCK_A.lat,
        MOCK_A.lng,
      ),
    ).toBeCloseTo(0, 5);
  });

  it('computes plausible short distances', () => {
    // One latitude-minute ≈ 1852 m
    const d = distanceMetres(6.4531, 3.3958, 6.46977, 3.3958);
    expect(d).toBeGreaterThan(1800);
    expect(d).toBeLessThan(1900);
  });

  it('is symmetric within tolerance', () => {
    const ab = distanceMetres(MOCK_A.lat, MOCK_A.lng, MOCK_B.lat, MOCK_B.lng);
    const ba = distanceMetres(MOCK_B.lat, MOCK_B.lng, MOCK_A.lat, MOCK_A.lng);
    expect(ab).toBeCloseTo(ba, 6);
  });
});

describe('isWithinGeofence', () => {
  it('allows inside and blocks outside the radius', () => {
    // ~100 m north
    expect(isWithinGeofence(6.454, 3.3958, 6.4531, 3.3958, 200)).toBe(true);
    // ~1.85 km north
    expect(isWithinGeofence(6.46977, 3.3958, 6.4531, 3.3958, 200)).toBe(false);
  });
});
