import { z } from 'zod';
import { PASSWORD_MIN_LENGTH, PHOTO_ACCEPTED_MIME_TYPES } from '@fazoo/config';
import {
  normalizeInternationalPhone,
  normalizeNigerianPhone,
  phoneToAuthEmail,
} from './phone';

/** Zod transform: any common input form → canonical +234E.164. */
export const nigerianPhone = z
  .string()
  .trim()
  .min(1, 'Mobile number is required.')
  .transform((value, ctx) => {
    const result = normalizeNigerianPhone(value);
    if (!result.ok || !result.e164) {
      ctx.addIssue({
        code: 'custom',
        message:
          result.reason === 'invalid_length'
            ? 'Enter a valid 11-digit Nigerian mobile number.'
            : 'Enter a valid Nigerian mobile number (070x/080x/081x/090x/091x).',
      });
      return z.NEVER;
    }
    return result.e164;
  });

export const password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `At least ${PASSWORD_MIN_LENGTH} characters.`)
  .regex(/[A-Z]/, 'Include at least one uppercase letter.')
  .regex(/[a-z]/, 'Include at least one lowercase letter.')
  .regex(/\d/, 'Include at least one number.');

/** Zod transform: any common input form → canonical international E.164. */
export const internationalPhone = z
  .string()
  .trim()
  .min(1, 'Mobile number is required.')
  .transform((value, ctx) => {
    const result = normalizeInternationalPhone(value);
    if (!result.ok || !result.e164) {
      ctx.addIssue({
        code: 'custom',
        message:
          result.reason === 'invalid_length'
            ? 'Enter a valid mobile number (include your country code, e.g. +2547…).'
            : 'Enter a valid mobile number (include your country code, e.g. +2547…).',
      });
      return z.NEVER;
    }
    return result.e164;
  });

export const photoUpload = z.object({
  mime_type: z.enum(PHOTO_ACCEPTED_MIME_TYPES),
  size_bytes: z
    .number()
    .int()
    .positive()
    .max(
      8 * 1024 * 1024,
      'Photograph must be smaller than 8 MB.',
    ),
});

/** BA registration — all fields required per the Lenovo experience. */
export const registrationSchema = z
  .object({
    full_name: z
      .string()
      .trim()
      .min(3, 'Enter your full name as shown on your ID.')
      .max(120)
      .regex(/^[\p{L}\p{M}'.\- ]+$/u, 'Letters, spaces, hyphens and apostrophes only.'),
    phone: internationalPhone,
    phone_confirm: z.string().trim().min(1, 'Confirm your mobile number.'),
    password,
    password_confirm: z.string().min(1, 'Confirm your password.'),
    profile_photo: photoUpload.nullable().refine(
      (value) => value !== null,
      'A profile photograph is required.',
    ),
  })
  .check((ctx) => {
    if (ctx.value.phone !== ctx.value.phone_confirm) {
      ctx.issues.push({
        code: 'custom',
        path: ['phone_confirm'],
        input: ctx.value.phone_confirm,
        message: 'Mobile numbers must match.',
      });
    }
    if (ctx.value.password !== ctx.value.password_confirm) {
      ctx.issues.push({
        code: 'custom',
        path: ['password_confirm'],
        input: ctx.value.phone_confirm,
        message: 'Passwords do not match.',
      });
    }
  });

export type RegistrationInput = z.output<typeof registrationSchema>;

export const signInSchema = z.object({
  phone: internationalPhone,
  password: z.string().min(1, 'Password is required.'),
});
export type SignInInput = z.input<typeof signInSchema> & {
  /** normalized output */
};

/** Convenience for auth calls: derive the internal alias from raw input. */
export function toAuthEmail(rawPhone: string): string | null {
  const result = normalizeInternationalPhone(rawPhone);
  return result.ok && result.e164 ? phoneToAuthEmail(result.e164) : null;
}
