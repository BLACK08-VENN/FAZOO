import { z } from 'zod';

export const campaignInputSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(2000).nullable().optional(),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    status: z.enum(['draft', 'active', 'completed', 'cancelled']),
  })
  .refine(
    (v) => !v.end_date || v.start_date <= v.end_date,
    { message: 'End date must be on or after start date.' },
  );

export const storeInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  address: z.string().trim().max(500).nullable().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  geofence_radius_metres: z
    .number()
    .int()
    .min(20, 'Radius must be at least 20 m.')
    .max(2000, 'Radius must be at most 2000 m.'),
  status: z.enum(['active', 'inactive']),
});

export const skuInputSchema = z.object({
  campaign_id: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Za-z0-9._-]+$/, 'Letters, digits, dot, dash, underscore only.'),
  description: z.string().trim().max(1000).nullable().optional(),
  status: z.enum(['active', 'inactive']),
});

export const weeklyOffDaySchema = z
  .number()
  .int()
  .min(0)
  .max(6);

export const assignmentInputSchema = z
  .object({
    brand_ambassador_id: z.string().uuid(),
    campaign_id: z.string().uuid(),
    store_id: z.string().uuid(),
    weekly_off_day: weeklyOffDaySchema,
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    status: z.enum(['active', 'ended', 'cancelled']),
  })
  .refine(
    (v) => !v.end_date || v.start_date <= v.end_date,
    { message: 'End date must be on or after start date.' },
  );

/** URL filter model shared by daily-logs page + CSV export route. */
export const logFiltersSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  preset: z.enum(['7d', '30d', '90d', 'custom']).default('30d'),
  campaign_id: z.string().uuid().optional(),
  ba_id: z.string().uuid().optional(),
  store_id: z.string().uuid().optional(),
  sku_id: z.string().uuid().optional(),
  attendance_status: z
    .enum(['present', 'sick_leave', 'weekly_off', 'absent'])
    .optional(),
  completion_status: z.enum(['open', 'completed']).optional(),
});
export type LogFilters = z.infer<typeof logFiltersSchema>;

export const accountStatusActionSchema = z.object({
  profile_id: z.string().uuid(),
  action: z.enum(['approve', 'reject', 'suspend', 'reactivate', 'deactivate']),
  reason: z.string().trim().max(500).optional(),
});
