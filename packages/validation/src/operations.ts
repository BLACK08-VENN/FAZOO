import { z } from 'zod';

export const saleEntrySchema = z.object({
  sku_id: z.string().uuid('Select a SKU.'),
  quantity: z
    .number({ message: 'Quantity is required.' })
    .int('Quantity must be a whole number.')
    .positive('Quantity must be at least 1.')
    .max(10_000, 'That quantity looks wrong — please check.'),
});
export type SaleEntryInput = z.infer<typeof saleEntrySchema>;

export const salesBatchSchema = z.object({
  entries: z.array(saleEntrySchema).min(1, 'Add at least one SKU.').max(200),
});

export const gpsCoordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy_metres: z.number().nonnegative().max(10_000).nullable().optional(),
});

export const checkinSchema = gpsCoordinatesSchema.extend({
  stock_photo_path: z.string().min(1),
  uniform_selfie_path: z.string().min(1),
  notes: z.string().trim().max(1000).nullable().optional(),
  client_request_id: z.string().uuid(),
});

export const checkoutSchema = gpsCoordinatesSchema.extend({
  stock_photo_path: z.string().min(1),
  uniform_selfie_path: z.string().min(1),
  checkout_photo_path: z.string().min(1).nullable().optional(),
  client_request_id: z.string().uuid(),
});

export const sickLeaveSchema = z.object({
  note: z.string().trim().max(500).nullable().optional(),
  client_request_id: z.string().uuid(),
});

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');

export const dateRangeSchema = z
  .object({
    from: isoDate,
    to: isoDate,
  })
  .refine((r) => r.from <= r.to, {
    message: '“From” must be on or before “To”.',
  })
  .refine((r) => {
    const ms = Date.parse(`${r.to}T00:00:00Z`) - Date.parse(`${r.from}T00:00:00Z`);
    return ms <= 366 * 86_400_000;
  }, 'Range is limited to one year.');

export const presetRange = z.enum(['7d', '30d', '90d', 'custom']);
export type PresetRange = z.infer<typeof presetRange>;
