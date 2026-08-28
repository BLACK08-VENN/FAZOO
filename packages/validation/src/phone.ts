/**
 * Nigerian phone-number normalization.
 *
 * Accepts the common local formats and produces the canonical E.164-style
 * storage form used across the platform: `+234XXXXXXXXXX` (11 digits after
 * country code, leading trunk `0` stripped).
 *
 *   0803 123 4567     → +2348031234567
 *   +234 803 123 4567 → +2348031234567
 *   2348031234567     → +2348031234567
 *
 * Valid Nigerian mobile prefixes (after 234/0): 70x, 80x, 81x, 90x, 91x.
 */

const NG_COUNTRY_CODE = '234';
const LOCAL_NUMBER_LENGTH = 10; // digits after country code / trunk zero

export interface NormalizeResult {
  ok: boolean;
  e164?: string;
  reason?: 'empty' | 'invalid_characters' | 'invalid_length' | 'invalid_prefix';
}

/** Strip formatting characters; keep leading +. */
function stripDialling(input: string): { plus: boolean; digits: string } {
  const trimmed = input.trim();
  const plus = trimmed.startsWith('+');
  const digits = trimmed.replace(/[^\d]/g, '');
  return { plus, digits };
}

export function normalizeNigerianPhone(input: string): NormalizeResult {
  if (!input.trim()) return { ok: false, reason: 'empty' };

  const { plus, digits } = stripDialling(input);
  if (!digits) return { ok: false, reason: 'invalid_characters' };

  let national = digits;

  if (plus || digits.startsWith(NG_COUNTRY_CODE)) {
    // International form: 234 + 10 significant digits
    national = digits.startsWith(NG_COUNTRY_CODE)
      ? digits.slice(NG_COUNTRY_CODE.length)
      : digits;
    if (national.length !== LOCAL_NUMBER_LENGTH) {
      return { ok: false, reason: 'invalid_length' };
    }
  } else if (digits.startsWith('0')) {
    // Local trunk form: 0 + 10 digits
    national = digits.slice(1);
    if (national.length !== LOCAL_NUMBER_LENGTH) {
      return { ok: false, reason: 'invalid_length' };
    }
  } else if (digits.length === LOCAL_NUMBER_LENGTH) {
    // Bare 10-digit national number
    national = digits;
  } else {
    return { ok: false, reason: 'invalid_length' };
  }

  if (!/^([789]\d{9})$/.test(national)) {
    return { ok: false, reason: 'invalid_prefix' };
  }

  return { ok: true, e164: `+${NG_COUNTRY_CODE}${national}` };
}

/**
 * Strict variant for Zod refinements — returns the E.164 string or throws
 * a descriptive error message suitable for direct form display.
 */
export function requireNigerianPhone(input: string): string {
  const result = normalizeNigerianPhone(input);
  if (!result.ok || !result.e164) {
    switch (result.reason) {
      case 'empty':
        throw new Error('Mobile number is required.');
      case 'invalid_length':
        throw new Error('Enter a valid 11-digit Nigerian mobile number.');
      case 'invalid_prefix':
        throw new Error(
          'That does not look like a Nigerian mobile number (expected 070x/080x/081x/090x/091x).',
        );
      default:
        throw new Error('Enter a valid Nigerian mobile number.');
    }
  }
  return result.e164;
}

/**
 * Deterministic internal auth identity for phone-based sign-in.
 * `<digits>@ba.fazoo.app` — see docs/architecture.md §2.1. Never displayed.
 */
export function phoneToAuthEmail(e164: string): string {
  if (!e164.startsWith('+')) throw new Error('Expected E.164 phone number');
  return `${e164.slice(1)}@ba.fazoo.app`;
}

/**
 * International phone normalisation for phone-based sign-in.
 *
 * Fazoo runs across several markets (Nigeria, Kenya, India, UAE…) so a single
 * Nigerian-only parser is too narrow. This accepts:
 *
 *   • full E.164 (+CC + national number)              e.g. +971585645890, +919810960131
 *   • a bare country-code prefix                      e.g. 2348031234567, 254796402289
 *   • local Nigerian national (0 + 10 digits)         e.g. 08031234567 → +2348031234567
 *   • local Kenyan national  (0 + 9 digits)           e.g. 0796402289  → +254796402289
 *   • bare national forms                             e.g. 8031234567 → +2348031234567
 *
 * Unknown/ambiguous input returns `{ ok:false }` with a reason; callers should
 * prompt the user to include their country code.
 */

/** (country code, national significant digits, whether the trunk uses a leading 0) */
const KNOWN_COUNTRY_CODES: Array<{ cc: string; national: number; trunk: boolean; prefixes: RegExp }> = [
  { cc: '234', national: 10, trunk: true, prefixes: /^[7891]/ }, // Nigeria
  { cc: '254', national: 9,  trunk: true, prefixes: /^[71]/ },   // Kenya
  { cc: '91',  national: 10, trunk: false, prefixes: /^[6789]/ },// India
  { cc: '971', national: 9,  trunk: false, prefixes: /^[52]/ },  // UAE
];

export type InternationalPhoneResult = NormalizeResult;

/** Resolve a known country code -> E.164 from significant national digits. */
function carryWithCountryCode(cc: string, nationalDigits: string): NormalizeResult {
  const spec = KNOWN_COUNTRY_CODES.find((s) => s.cc === cc);
  if (!spec) return { ok: false, reason: 'invalid_prefix' };
  if (nationalDigits.length !== spec.national) {
    return { ok: false, reason: 'invalid_length' };
  }
  if (!spec.prefixes.test(nationalDigits)) {
    return { ok: false, reason: 'invalid_prefix' };
  }
  return { ok: true, e164: `+${cc}${nationalDigits}` };
}

export function normalizeInternationalPhone(input: string): InternationalPhoneResult {
  if (!input.trim()) return { ok: false, reason: 'empty' };

  const { plus, digits } = stripDialling(input);
  if (!digits) return { ok: false, reason: 'invalid_characters' };

  // 1. Explicit '+' and a known country code prefix → trust it as E.164.
  for (const spec of KNOWN_COUNTRY_CODES) {
    if (digits.startsWith(spec.cc)) {
      const national = digits.slice(spec.cc.length);
      const r = carryWithCountryCode(spec.cc, national);
      if (plus && r.ok) return r;
      if (!plus && r.ok) return r;
    }
  }

  // 2. Local national forms (leading trunk zero).
  if (digits.startsWith('0')) {
    const national = digits.slice(1);
    for (const spec of KNOWN_COUNTRY_CODES) {
      if (spec.trunk && national.length === spec.national && spec.prefixes.test(national)) {
        return carryWithCountryCode(spec.cc, national);
      }
    }
    return { ok: false, reason: 'invalid_prefix' };
  }

  // 3. Bare national numbers (no trunk zero) — try Nigeria, then Kenya.
  if (digits.length === 10 && /^[7891]/.test(digits)) {
    return { ok: true, e164: `+234${digits}` };
  }
  if (digits.length === 9 && /^[71]/.test(digits)) {
    return { ok: true, e164: `+254${digits}` };
  }

  return { ok: false, reason: 'invalid_length' };
}

/**
 * Require an international number and return its E.164 (throws a friendly error).
 * If the input carries no recognisable country code the caller is asked to
 * include one (avoids guessing wrong between suffixed markets).
 */
export function requireInternationalPhone(input: string): string {
  const result = normalizeInternationalPhone(input);
  if (!result.ok || !result.e164) {
    switch (result.reason) {
      case 'empty':
        throw new Error('Mobile number is required.');
      case 'invalid_length':
        throw new Error('Enter a valid mobile number (include your country code, e.g. +2547…).');
      case 'invalid_prefix':
        throw new Error('That does not look like a valid mobile number for your country.');
      default:
        throw new Error('Enter a valid mobile number.');
    }
  }
  return result.e164;
}
