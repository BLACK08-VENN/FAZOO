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

/** 0..3 distinct weekly off-days (0=Sun … 6=Sat), deduplicated server-side. */
export const weeklyOffDaysSchema = z
  .array(weeklyOffDaySchema)
  .max(4, 'Select at most 4 weekly off-days.');

export const assignmentInputSchema = z
  .object({
    brand_ambassador_id: z.string().uuid(),
    campaign_id: z.string().uuid(),
    store_id: z.string().uuid(),
    weekly_off_day: z.array(z.number().int().min(0).max(6)).max(4),
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

export const createBaInputSchema = z
  .object({
    full_name: z
      .string()
      .trim()
      .min(3, 'Enter the BA full name as shown on their ID.')
      .max(120)
      .regex(/^[\p{L}\p{M}'.\- ]+$/u, 'Letters, spaces, hyphens and apostrophes only.'),
    phone: z.string().trim().min(1, 'Mobile number is required.'),
    weekly_off_day: z
      .array(weeklyOffDaySchema)
      .max(4, 'Select at most 4 weekly off-days.')
      .default([]),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .or(z.literal('')),
  })
  .refine(
    (v) => !v.end_date || v.end_date === '' || v.start_date <= v.end_date,
    { message: 'End date must be on or after start date.', path: ['end_date'] },
  );
export type CreateBaInput = z.infer<typeof createBaInputSchema>;

export const deleteBaSchema = z.object({
  profile_id: z.string().uuid(),
});
export type DeleteBaInput = z.infer<typeof deleteBaSchema>;

export const createBrandSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    slug: z
      .string()
      .trim()
      .min(2)
      .max(60)
      .regex(/^[a-z0-9-]+$/, 'Lowercase letters, digits, dashes only.'),
    timezone: z.string().trim().min(1).max(64).optional(),
    access_code: z.string().trim().min(4).max(40).optional().or(z.literal('')),
    // Brand admin.
    admin_name: z.string().trim().min(2).max(120),
    admin_email: z.string().trim().email(),
    admin_phone: z.string().trim().min(4).max(20),
    // Campaign.
    campaign_name: z.string().trim().max(120).optional().or(z.literal('')),
    campaign_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
    campaign_end: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .or(z.literal('')),
    // First store (optional).
    store_name: z.string().trim().max(160).optional().or(z.literal('')),
    store_address: z.string().trim().max(500).optional().or(z.literal('')),
    store_lat: z.string().trim().optional().or(z.literal('')),
    store_lng: z.string().trim().optional().or(z.literal('')),
    store_radius: z.coerce.number().int().min(20).max(2000).optional(),
    weekly_off_day: z
      .array(z.coerce.number().int().min(0).max(6))
      .max(4)
      .default([0]),
    ba_ids: z.array(z.string()).default([]),
  })
  .refine(
    (v) =>
      !v.campaign_name ||
      v.campaign_name === '' ||
      !v.campaign_end ||
      v.campaign_end === '' ||
      (!!v.campaign_start && v.campaign_start <= v.campaign_end),
    { message: 'Campaign end must be on or after start.', path: ['campaign_end'] },
  )
  .refine(
    (v) => !v.campaign_name || v.campaign_name === '' || !!v.campaign_start,
    { message: 'Campaign start date is required when you enter a campaign name.', path: ['campaign_start'] },
  )
  .refine(
    (v) =>
      !v.store_name ||
      v.store_name === '' ||
      (v.store_lat !== '' && v.store_lng !== ''),
    { message: 'Store coordinates are required when a store name is given.', path: ['store_lat'] },
  );
