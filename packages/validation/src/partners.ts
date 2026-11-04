import { z } from 'zod';

export const PARTNER_STATES = [
  'Abia',
  'Adamawa',
  'Akwa Ibom',
  'Anambra',
  'Bauchi',
  'Bayelsa',
  'Benue',
  'Borno',
  'Cross River',
  'Delta',
  'Ebonyi',
  'Edo',
  'Ekiti',
  'Enugu',
  'FCT (Abuja)',
  'Gombe',
  'Imo',
  'Jigawa',
  'Kaduna',
  'Kano',
  'Katsina',
  'Kebbi',
  'Kogi',
  'Kwara',
  'Lagos',
  'Nasarawa',
  'Niger',
  'Ogun',
  'Ondo',
  'Osun',
  'Oyo',
  'Plateau',
  'Rivers',
  'Sokoto',
  'Taraba',
  'Yobe',
  'Zamfara',
] as const;
export const PARTNER_BRANDS = [
  'Lenovo',
  'HP',
  'Dell',
  'Apple',
  'Asus',
  'Acer',
  'Other',
] as const;
export const PARTNER_PRODUCTS = [
  'Printers',
  'Projectors',
  'Accessories',
  'Networking',
  'Phones & Tablets',
  'Servers & Storage',
  'Gaming and Gaming Accessories',
] as const;
export const PARTNER_MOSTLY = [
  'PCs / laptops',
  'Printers',
  'Projectors',
  'Accessories',
  'Networking',
  'Phones & tablets',
  'Servers & storage',
  'UPS / power',
  'Mixed',
] as const;
export const PARTNER_CUSTOMERS = [
  'Walk-in / retail',
  'SMB',
  'Corporate',
  'Government',
  'Education',
  'Mixed',
] as const;
const quantity = z.number().int().min(0).max(10000000).nullable();
const text = (max: number) => z.string().trim().min(1).max(max);
export const partnerLogSchema = z
  .object({
    partner_id: z.uuid().nullable(),
    company_name: text(200),
    city: text(160),
    state: z.enum(PARTNER_STATES),
    branch: z.string().trim().max(160),
    visit_date: z.iso.date(),
    visit_method: z.enum(['Visit', 'Call']),
    reporting_month: z.iso.date().refine((v) => v.endsWith('-01'), 'Select a reporting month'),
    sales_basis: z.enum(['Actual month', 'Typical month estimate']),
    contact_person: text(160),
    phone: z
      .string()
      .trim()
      .max(40)
      .refine((v) => !v || /^\+?[\d ()-]{7,40}$/.test(v), 'Enter a valid phone number'),
    email: z.union([z.literal(''), z.email().max(254)]),
    employees: quantity,
    sales: z
      .object({
        Lenovo: quantity,
        HP: quantity,
        Dell: quantity,
        Apple: quantity,
        Asus: quantity,
        Acer: quantity,
        Other: quantity,
      })
      .strict(),
    other_brand_names: z.string().trim().max(300),
    sells_mostly: z.enum(PARTNER_MOSTLY),
    products: z
      .object({
        Printers: z.enum(['Yes', 'No', 'Unknown']),
        Projectors: z.enum(['Yes', 'No', 'Unknown']),
        Accessories: z.enum(['Yes', 'No', 'Unknown']),
        Networking: z.enum(['Yes', 'No', 'Unknown']),
        'Phones & Tablets': z.enum(['Yes', 'No', 'Unknown']),
        'Servers & Storage': z.enum(['Yes', 'No', 'Unknown']),
        'Gaming and Gaming Accessories': z.enum(['Yes', 'No', 'Unknown']),
      })
      .strict(),
    main_customers: z.enum(PARTNER_CUSTOMERS),
    notes: z.string().trim().max(3000),
    correction_of: z.uuid().nullable(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if ((v.sales.Other ?? 0) > 0 && !v.other_brand_names)
      ctx.addIssue({
        code: 'custom',
        path: ['other_brand_names'],
        message: 'Name the other brands sold',
      });
  });
export type PartnerLogInput = z.infer<typeof partnerLogSchema>;
export function partnerTotals(sales: PartnerLogInput['sales'], high = 100, medium = 30) {
  const complete = PARTNER_BRANDS.every((b) => sales[b] !== null);
  const total = complete ? PARTNER_BRANDS.reduce((sum, b) => sum + (sales[b] ?? 0), 0) : null;
  return {
    total,
    share: total === null || total === 0 ? null : (sales.Lenovo ?? 0) / total,
    priority:
      total === null ? 'Unknown' : total >= high ? 'High' : total >= medium ? 'Medium' : 'Low',
  };
}
