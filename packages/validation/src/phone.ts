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
