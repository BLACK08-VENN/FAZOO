import type { PartnerLogInput } from '@fazoo/validation';

export type PartnerOutlet = {
  id: string;
  company_name: string;
  city: string;
  state: PartnerLogInput['state'];
  branch: string;
};
export type PartnerLog = {
  id: string;
  partner_id: string;
  collected_by: string;
  collector_name: string;
  visit_date: string;
  reporting_month: string;
  created_at: string;
  payload: PartnerLogInput;
  total_pcs: number | null;
  lenovo_units: number | null;
  correction_of: string | null;
  priority: string;
  revision: number;
};
export type PartnerMetric = { label: string; companies: number; units?: number };
export type PartnerWorkspace = {
  high: number;
  medium: number;
  logs_count: number;
  outlets_count: number;
  current_count: number;
  complete_count: number;
  unknown_count: number;
  estimated_count: number;
  total_pcs: number;
  lenovo_units: number;
  brands: Array<PartnerMetric & { units: number }>;
  products: PartnerMetric[];
  priorities: PartnerMetric[];
  states: PartnerMetric[];
  customers: PartnerMetric[];
  mostly: PartnerMetric[];
  collectors: Array<{ id: string; name: string; logs: number }>;
  logs: PartnerLog[];
};
export const PARTNER_HEADERS = [
  'Date',
  'Company Name',
  'City / Area',
  'State',
  'Contact Person',
  'Phone',
  'Email',
  'No. of Employees',
  'Lenovo',
  'HP',
  'Dell',
  'Apple',
  'Asus',
  'Acer',
  'Other',
  'Other Brand Names',
  'Total PCs / Month',
  'Lenovo Share',
  'Sells Mostly',
  'Printers',
  'Projectors',
  'Accessories',
  'Networking',
  'Phones & Tablets',
  'Servers & Storage',
  'Gaming and Gaming Accessories',
  'Main Customers',
  'Priority',
  'Collected By',
  'Notes',
  'Branch / Outlet',
  'Reporting Month',
  'Sales Basis',
  'Visit Method',
  'Submitted (Africa/Lagos)',
  'Log ID',
  'Corrects Log ID',
  'Current Monthly Record',
];
export function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? 'Unknown' : String(value);
  // CSV readers can ignore leading control characters before a formula.
  // eslint-disable-next-line no-control-regex
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}
