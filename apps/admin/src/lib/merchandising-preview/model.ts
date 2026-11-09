import { z } from 'zod';

const detail = z.string().trim().min(2).max(120);
export const assignmentSchema = z.object({
  outlet: detail,
  campaign: detail,
  assignee: detail,
  product: detail,
});
export const reportSchema = z.object({
  quantity: z.number().int().min(0).max(999999),
  display: z.enum(['In place', 'Needs correction', 'Missing']),
  promotion: z.enum(['Running', 'Missing or incorrect', 'Not scheduled']),
  notes: z.string().trim().max(1200),
  photo: z
    .string()
    .max(160000)
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/)
    .optional(),
});

export const visitsSchema = z.array(
  assignmentSchema.extend({
    id: z.string(),
    arrival: z.iso.datetime().optional(),
    report: reportSchema.optional(),
    resolved: z.boolean().optional(),
  }),
);
export type Visit = z.infer<typeof visitsSchema>[number];

export function needsFollowUp(visit: Visit) {
  const report = visit.report;
  return Boolean(
    report &&
    !visit.resolved &&
    (report.quantity === 0 ||
      report.display !== 'In place' ||
      report.promotion === 'Missing or incorrect'),
  );
}

export const sampleVisits: Visit[] = [
  {
    id: 'mw-101',
    outlet: 'Outlet A · Checkout',
    campaign: 'Orbit checkout visibility',
    assignee: 'Retail merchandiser',
    product: 'Orbit peppermint · Single pack',
  },
  {
    id: 'mw-102',
    outlet: 'Outlet B · Confectionery aisle',
    campaign: 'Retail availability',
    assignee: 'Retail merchandiser',
    product: 'Skittles Fruits · Single pack',
    arrival: '2026-11-05T08:15:00.000Z',
    report: {
      quantity: 0,
      display: 'Missing',
      promotion: 'Not scheduled',
      notes: 'Shelf slot empty. Ask the store supervisor about the next replenishment.',
    },
  },
];
