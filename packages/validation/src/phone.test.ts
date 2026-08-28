import { describe, expect, it } from 'vitest';
import {
  normalizeInternationalPhone,
  normalizeNigerianPhone,
  phoneToAuthEmail,
  requireInternationalPhone,
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

describe('normalizeInternationalPhone', () => {
  it('keeps full E.164 with country code (Kenya)', () => {
    expect(normalizeInternationalPhone('+254796402289')).toEqual({ ok: true, e164: '+254796402289' });
  });
  it('keeps full E.164 with country code (India)', () => {
    expect(normalizeInternationalPhone('+919810960131')).toEqual({ ok: true, e164: '+919810960131' });
  });
  it('keeps full E.164 with country code (UAE)', () => {
    expect(normalizeInternationalPhone('+971585645890')).toEqual({ ok: true, e164: '+971585645890' });
  });
  it('keeps full E.164 with country code (Nigeria)', () => {
    expect(normalizeInternationalPhone('+2348031234567')).toEqual({ ok: true, e164: '+2348031234567' });
  });
  it('recognises a bare Nigerian country-code prefix', () => {
    expect(normalizeInternationalPhone('2348031234567')).toEqual({ ok: true, e164: '+2348031234567' });
  });
  it('recognises a bare Kenyan country-code prefix', () => {
    expect(normalizeInternationalPhone('254796402289')).toEqual({ ok: true, e164: '+254796402289' });
  });
  it('normalises a Kenyan local trunk-zero number', () => {
    expect(normalizeInternationalPhone('0796402289')).toEqual({ ok: true, e164: '+254796402289' });
  });
  it('still normalises Nigerian local formats', () => {
    expect(normalizeInternationalPhone('08031234567')).toEqual({ ok: true, e164: '+2348031234567' });
    expect(normalizeInternationalPhone('8031234567')).toEqual({ ok: true, e164: '+2348031234567' });
  });
  it('rejects an unknown/ambiguous bare number', () => {
    expect(normalizeInternationalPhone('12345')).toEqual({ ok: false, reason: 'invalid_length' });
  });
  it('rejects empty input', () => {
    expect(normalizeInternationalPhone('   ').ok).toBe(false);
  });
});

describe('requireInternationalPhone', () => {
  it('returns E.164 on success', () => {
    expect(requireInternationalPhone('0796402289')).toBe('+254796402289');
  });
  it('throws a friendly message on failure', () => {
    expect(() => requireInternationalPhone('12')).toThrow(/country code/);
  });
});
