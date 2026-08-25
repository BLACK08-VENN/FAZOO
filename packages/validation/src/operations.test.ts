import { describe, expect, it } from 'vitest';
import { saleEntrySchema, checkinSchema, dateRangeSchema } from './operations';

describe('saleEntrySchema', () => {
  it('accepts a positive integer quantity', () => {
    expect(
      saleEntrySchema.parse({ sku_id: crypto.randomUUID(), quantity: 3 }),
    ).toMatchObject({ quantity: 3 });
  });
  it.each([0, -1, 2.5])('rejects quantity %s', (quantity) => {
    expect(() =>
      saleEntrySchema.parse({ sku_id: crypto.randomUUID(), quantity }),
    ).toThrow();
  });
});

describe('checkinSchema', () => {
  const base = {
    latitude: 6.5244,
    longitude: 3.3792,
    stock_photo_path: 'org/ba/stock.jpg',
    uniform_selfie_path: 'org/ba/selfie.jpg',
    client_request_id: crypto.randomUUID(),
  };
  it('accepts valid payload', () => {
    expect(checkinSchema.parse(base)).toBeTruthy();
  });
  it('rejects out-of-range coordinates', () => {
    expect(() => checkinSchema.parse({ ...base, latitude: 95 })).toThrow();
    expect(() => checkinSchema.parse({ ...base, longitude: -200 })).toThrow();
  });
});

describe('dateRangeSchema', () => {
  it('accepts an ordered range', () => {
    expect(
      dateRangeSchema.parse({ from: '2026-01-01', to: '2026-01-31' }),
    ).toBeTruthy();
  });
  it('rejects inverted ranges', () => {
    expect(() =>
      dateRangeSchema.parse({ from: '2026-02-01', to: '2026-01-31' }),
    ).toThrow();
  });
  it('rejects ranges beyond one year', () => {
    expect(() =>
      dateRangeSchema.parse({ from: '2025-01-01', to: '2026-06-01' }),
    ).toThrow(/one year/i);
  });
});
