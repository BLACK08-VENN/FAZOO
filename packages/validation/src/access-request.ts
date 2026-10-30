import { z } from 'zod';
import { normalizeInternationalPhone } from './phone';

export const requestedAccessRoles = ['brand_ambassador', 'client', 'supervisor'] as const;

export const accessRequestSchema = z.object({
  client_request_id: z.uuid(),
  full_name: z.string().trim().min(2, 'Enter your full name.').max(120),
  organization_name: z.string().trim().min(2, 'Enter your company or organization.').max(160),
  requested_role: z.enum(requestedAccessRoles, {
    error: 'Choose the access you are requesting.',
  }),
  contact: z
    .string()
    .trim()
    .min(1, 'Enter your email or phone number.')
    .max(254)
    .transform((value, ctx) => {
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return value.toLowerCase();
      if (/^[+\d().\s-]+$/.test(value)) {
        const phone = normalizeInternationalPhone(value);
        if (phone.ok && phone.e164) return phone.e164;
      }
      ctx.addIssue({
        code: 'custom',
        message: 'Enter a valid email or phone number with country code.',
      });
      return z.NEVER;
    }),
});

export type AccessRequestInput = z.output<typeof accessRequestSchema>;
