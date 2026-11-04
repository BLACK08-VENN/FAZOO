import type { NextRequest } from 'next/server';
import { PARTNER_BRANDS, PARTNER_PRODUCTS } from '@fazoo/validation';
import { lagosDateTime } from '@fazoo/config';
import { requirePartnerAccess, partnerFilters } from '@/lib/partners-server';
import { PARTNER_HEADERS, csvCell, type PartnerWorkspace } from '@/lib/partners';

export async function GET(request: NextRequest) {
  const { client, profile } = await requirePartnerAccess();
  if (!['organization_admin', 'super_admin', 'client'].includes(profile.role))
    return new Response('Forbidden', { status: 403 });
  const { data: allowed, error: limitError } = await client.rpc('check_rate_limit', {
    p_key: `partner-export:${profile.id}`,
    p_max: 10,
    p_window_seconds: 300,
  });
  if (limitError || !allowed)
    return new Response('Too many exports. Please try again shortly.', { status: 429 });
  const filters = partnerFilters(request.nextUrl.searchParams);
  const { data, error } = await client.rpc('partner_workspace', { ...filters, p_page: 0 });
  if (error)
    return new Response('Partner export could not load. Please try again.', { status: 503 });
  const w = data as unknown as PartnerWorkspace;
  const summary = request.nextUrl.searchParams.get('summary') === '1';
  if (!summary && w.logs_count > 10000)
    return new Response(
      'This export exceeds 10,000 logs. Narrow the state, merchandiser or company filters and export again.',
      { status: 422 },
    );
  const rows: unknown[][] = summary
    ? [
        ['Section', 'Metric', 'Value', 'Units / Definition'],
        [
          'Scope',
          'Reporting month',
          filters.p_month.slice(0, 7),
          'Latest submission per outlet/month for market metrics',
        ],
        ['Scope', 'State', filters.p_state || 'All', ''],
        ['Scope', 'Collector', filters.p_collector || 'All', ''],
        ['Scope', 'Search', filters.p_search, ''],
        ['Overview', 'Submitted logs', w.logs_count, 'All submissions including corrections'],
        [
          'Overview',
          'Unique outlets',
          w.outlets_count,
          'Distinct outlets in filtered activity',
        ],
        ['Overview', 'Current monthly records', w.current_count, ''],
        ['Overview', 'Complete sales records', w.complete_count, ''],
        [
          'Overview',
          'Unknown sales records',
          w.unknown_count,
          'Excluded from brand totals/share',
        ],
        ['Overview', 'Typical month estimates', w.estimated_count, 'Current records'],
        [
          'Overview',
          'Total PCs/month',
          w.total_pcs,
          'Reported units from complete current records',
        ],
        ['Overview', 'Lenovo units/month', w.lenovo_units, 'Same complete current records'],
        [
          'Overview',
          'Lenovo share',
          w.total_pcs ? w.lenovo_units / w.total_pcs : 'Unavailable',
          'Ratio; multiply by 100 for percentage',
        ],
        ...w.brands.map((b) => ['Brand', b.label, b.units, 'Units/month']),
        ...w.brands.map((b) => [
          'Brand share',
          b.label,
          w.total_pcs ? b.units / w.total_pcs : 'Unavailable',
          'Ratio',
        ]),
        ...w.products.map((b) => [
          'Additional products',
          b.label,
          b.companies,
          'Outlets answering Yes',
        ]),
        ...w.priorities.map((b) => ['Priority', b.label, b.companies, 'Outlets']),
        ...w.states.map((b) => ['State', b.label, b.companies, 'Outlets']),
        ...w.customers.map((b) => ['Main customers', b.label, b.companies, 'Outlets']),
        ...w.mostly.map((b) => ['Sells mostly', b.label, b.companies, 'Outlets']),
      ]
    : [
        PARTNER_HEADERS,
        ...w.logs.map((l) => {
          const d = l.payload;
          return [
            l.visit_date,
            d.company_name,
            d.city,
            d.state,
            d.contact_person,
            d.phone,
            d.email,
            d.employees,
            ...PARTNER_BRANDS.map((b) => d.sales[b]),
            d.other_brand_names,
            l.total_pcs,
            l.total_pcs ? (l.lenovo_units ?? 0) / l.total_pcs : 'Unavailable',
            d.sells_mostly,
            ...PARTNER_PRODUCTS.map((b) => d.products[b]),
            d.main_customers,
            l.priority,
            l.collector_name,
            d.notes,
            d.branch,
            l.reporting_month.slice(0, 7),
            d.sales_basis,
            d.visit_method,
            lagosDateTime(l.created_at),
            l.id,
            l.correction_of || '',
            l.revision === 1 ? 'Yes' : 'No',
          ];
        }),
      ];
  const csv = '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="lenovo-partner-${summary ? 'summary' : 'logs'}-${filters.p_month.slice(0, 7)}.csv"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
