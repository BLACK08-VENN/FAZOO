import { describe, expect, it } from 'vitest';
import { registrationSchema } from './auth';

const validBase = {
  full_name: 'Adaeze Nwosu',
  phone: '0803 123 4567',
  password: 'Sup3rSecret!x',
  password_confirm: 'Sup3rSecret!x',
  profile_photo: { mime_type: 'image/jpeg', size_bytes: 240_000 },
};

describe('registrationSchema', () => {
  it('accepts a complete registration and normalizes the phone field', () => {
    const parsed = registrationSchema.parse(validBase);
    expect(parsed.phone).toBe('+2348031234567');
  });

  it('rejects weak passwords', () => {
    expect(() =>
      registrationSchema.parse({
        ...validBase,
        password: 'short1',
        password_confirm: 'short1',
      }),
    ).toThrow();
    expect(() =>
      registrationSchema.parse({
        ...validBase,
        password: 'alllowercase123',
        password_confirm: 'alllowercase123',
      }),
    ).toThrow();
  });

  it('allows signup without a profile photograph', () => {
    const parsed = registrationSchema.parse({ ...validBase, profile_photo: null });
    expect(parsed.profile_photo).toBeNull();
  });

  it('rejects oversized photographs', () => {
    expect(() =>
      registrationSchema.parse({
        ...validBase,
        profile_photo: { mime_type: 'image/png', size_bytes: 9 * 1024 * 1024 },
      }),
    ).toThrow(/8 MB/);
  });

  it('rejects unsupported mime types', () => {
    expect(() =>
      registrationSchema.parse({
        ...validBase,
        profile_photo: { mime_type: 'image/gif' as never, size_bytes: 1000 },
      }),
    ).toThrow();
  });

  it('rejects invalid names', () => {
    expect(() =>
      registrationSchema.parse({ ...validBase, full_name: '' }),
    ).toThrow();
    expect(() =>
      registrationSchema.parse({ ...validBase, full_name: 'Ch!ef123' }),
    ).toThrow();
  });
});
