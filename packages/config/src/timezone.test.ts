import { describe, expect, it } from 'vitest';
import {
  formatLagosDisplay,
  lagosDate,
  lagosDayOfWeek,
  weeklyOffDayName,
} from './timezone';

describe('lagosDate', () => {
  it('maps UTC instants to the Lagos calendar date (UTC+1)', () => {
    // 2026-08-24T22:30Z is already 2026-08-24 23:30 in Lagos → same day
    expect(lagosDate('2026-08-24T22:30:00Z')).toBe('2026-08-24');
    // 2026-08-24T23:30Z crosses into 2026-08-25 in Lagos
    expect(lagosDate('2026-08-24T23:30:00Z')).toBe('2026-08-25');
    // Just before Lagos midnight boundary
    expect(lagosDate('2026-12-31T22:59:59Z')).toBe('2026-12-31');
    expect(lagosDate('2026-12-31T23:00:00Z')).toBe('2027-01-01');
  });

  it('accepts Date objects', () => {
    expect(lagosDate(new Date('2026-06-15T10:00:00Z'))).toBe('2026-06-15');
  });

  it('throws on invalid input', () => {
    expect(() => lagosDate('not-a-date')).toThrow(RangeError);
  });
});

describe('lagosDayOfWeek', () => {
  it('returns Sunday-first weekday for the Lagos date', () => {
    // 2026-08-24 is a Monday
    expect(lagosDayOfWeek('2026-08-24T09:00:00Z')).toBe(1);
    // 2026-08-23 is a Sunday
    expect(lagosDayOfWeek('2026-08-23T09:00:00Z')).toBe(0);
  });
});

describe('formatLagosDisplay', () => {
  it('formats in en-NG style by default', () => {
    const s = formatLagosDisplay('2026-08-24T09:41:00Z');
    expect(s).toMatch(/2026/);
    expect(s).toMatch(/10:41/); // UTC+1
  });
});

describe('weeklyOffDayName', () => {
  it('maps indices to names', () => {
    expect(weeklyOffDayName(0)).toBe('Sunday');
    expect(weeklyOffDayName(6)).toBe('Saturday');
  });
});
