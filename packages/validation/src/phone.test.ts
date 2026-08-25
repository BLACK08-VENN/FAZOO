import { describe, expect, it } from 'vitest';
import {
  normalizeNigerianPhone,
  phoneToAuthEmail,
  requireNigerianPhone,
} from './phone';

describe('normalizeNigerianPhone', () => {
  it.each([
    ['08031234567', '+2348031234567'],
    ['0803 123 4567', '+2348031234567'],
    ['0803-123-4567', '+2348031234567'],
    ['+234 803 123 4567', '+2348031234567'],
    ['+2348031234567', '+2348031234567'],
    ['2348031234567', '+2348031234567'],
    ['8031234567', '+2348031234567'],
    [' 07031234567 ', '+2347031234567'],
    ['09121234567', '+2349121234567'],
  ])('normalizes %s → %s', (input, expected) => {
    expect(normalizeNigerianPhone(input)).toEqual({ ok: true, e164: expected });
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['abc', 'invalid_characters'],
    ['0803123456', 'invalid_length'], // too short
    ['080312345678', 'invalid_length'], // too long
    ['+23490312345678', 'invalid_length'],
    ['1234567890', 'invalid_prefix'], // valid length, wrong prefix
    ['01031234567', 'invalid_prefix'], // trunk zero stripped → 1xx invalid prefix
    ['0103123456', 'invalid_length'], // trunk zero stripped → 9 digits
  ])('rejects %s (%s)', (input, reason) => {
    const result = normalizeNigerianPhone(input);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe(reason);
  });
});

describe('requireNigerianPhone', () => {
  it('returns E.164 on success', () => {
    expect(requireNigerianPhone('0812 345 6789')).toBe('+2348123456789');
  });
  it('throws a user-friendly message on failure', () => {
    expect(() => requireNigerianPhone('123')).toThrow(/11-digit/);
  });
});

describe('phoneToAuthEmail', () => {
  it('builds the internal alias deterministically', () => {
    expect(phoneToAuthEmail('+2348031234567')).toBe('2348031234567@ba.fazoo.app');
  });
  it('rejects non-E.164 input', () => {
    expect(() => phoneToAuthEmail('08031234567')).toThrow();
  });
});
