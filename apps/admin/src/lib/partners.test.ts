import { describe, expect, it } from 'vitest';
import { csvCell, PARTNER_HEADERS } from './partners';
import { partnerTotals } from '@fazoo/validation';
describe('Partner reporting presentation', () => {
  it('distinguishes unknown totals from zero', () => {
    const zero = { Lenovo: 0, HP: 0, Dell: 0, Apple: 0, Asus: 0, Acer: 0, Other: 0 };
    expect(partnerTotals(zero)).toEqual({ total: 0, share: null, priority: 'Low' });
    expect(partnerTotals({ ...zero, HP: null })).toEqual({
      total: null,
      share: null,
      priority: 'Unknown',
    });
  });
  it('keeps all thirty workbook columns first and escapes spreadsheet injection', () => {
    expect(PARTNER_HEADERS[29]).toBe('Notes');
    expect(PARTNER_HEADERS).toHaveLength(38);
    expect(csvCell('=HYPERLINK("test")')).toBe('"\'=HYPERLINK(""test"")"');
    expect(csvCell('line\n"quote"')).toBe('"line\n""quote"""');
    expect(csvCell(null)).toBe('"Unknown"');
  });
});
