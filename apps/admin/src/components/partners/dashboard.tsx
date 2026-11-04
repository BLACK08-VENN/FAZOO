import Link from 'next/link';
import { PARTNER_STATES, PARTNER_BRANDS } from '@fazoo/validation';
import { formatLagosDisplay } from '@fazoo/config';
import { PageHeader, StatCard } from '@/components/page';
import { Card } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { loadPartnerWorkspace } from '@/lib/partners-server';
import { PartnerForm } from './form';
import { PartnerRefresh, PartnerThresholds } from './controls';
import type { PartnerMetric } from '@/lib/partners';

export async function PartnerDashboard({
  params,
  basePath,
}: {
  params: URLSearchParams;
  basePath: string;
}) {
  const { client, profile, filters, workspace: w } = await loadPartnerWorkspace(params);
  const ba = profile.role === 'brand_ambassador';
  const correct = params.get('correct');
  // Corrections use the same scoped database record; other people's logs are never exposed to a BA.
  let correction = w.logs.find((l) => l.id === correct && l.collected_by === profile.id);
  if (correct && !correction && ba) {
    const { data, error } = await client
      .from('partner_visit_logs')
      .select('*')
      .eq('id', correct)
      .eq('collected_by', profile.id)
      .single();
    if (!error && data) correction = data as unknown as typeof correction;
  }
  const pageLink = (page: number) => {
    const q = new URLSearchParams(params);
    q.delete('correct');
    q.set('page', String(page));
    return `${basePath}?${q}`;
  };
  const exportParams = new URLSearchParams(params);
  exportParams.delete('page');
  exportParams.delete('correct');
  const share =
    w.total_pcs > 0 ? `${((100 * w.lenovo_units) / w.total_pcs).toFixed(1)}%` : 'Not available';
  const num = (value: number) => value.toLocaleString('en-NG');
  function breakdown(title: string, rows: PartnerMetric[], units = false) {
    return (
      <Card className="p-4">
        <h2 className="mb-3 font-semibold">{title}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-xs text-muted">
                <th className="py-2 pr-3">Category</th>
                <th className="py-2 text-right">Outlets</th>
                {units ? <th className="py-2 pl-3 text-right">PCs/month</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-b border-ink/5">
                  <td className="py-2 pr-3">{r.label}</td>
                  <td className="py-2 text-right tabular-nums">{num(r.companies)}</td>
                  {units ? (
                    <td className="py-2 pl-3 text-right tabular-nums">{num(r.units ?? 0)}</td>
                  ) : null}
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td className="py-3 text-muted" colSpan={3}>
                    No submissions for these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    );
  }
  return (
    <>
      <PageHeader
        title={ba ? 'Partner collection' : 'Lenovo Nigeria partner dashboard'}
        description="Partner visits, reported monthly PC volumes and market coverage."
      >
        <PartnerRefresh automatic={!ba} />
      </PageHeader>
      <form
        method="get"
        action={basePath}
        className="mb-5 grid gap-3 rounded-xl border border-ink/10 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5"
      >
        <div>
          <Label htmlFor="filter-month">Sales reporting month</Label>
          <Input
            id="filter-month"
            name="month"
            type="month"
            defaultValue={filters.p_month.slice(0, 7)}
            required
          />
        </div>
        <div>
          <Label htmlFor="filter-state">State</Label>
          <Select id="filter-state" name="state" defaultValue={filters.p_state}>
            <option value="">All states</option>
            {PARTNER_STATES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </div>
        {!ba ? (
          <div>
            <Label htmlFor="filter-collector">Merchandiser</Label>
            <Select
              id="filter-collector"
              name="collector"
              defaultValue={filters.p_collector ?? ''}
            >
              <option value="">All merchandisers</option>
              {w.collectors.map((c) => (
                <option value={c.id} key={`${c.id}:${c.name}`}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        <div>
          <Label htmlFor="filter-search">Company / area / outlet</Label>
          <Input
            id="filter-search"
            name="search"
            maxLength={200}
            defaultValue={filters.p_search}
          />
        </div>
        <div className="flex items-end">
          <Button>Apply filters</Button>
        </div>
      </form>
      {ba ? (
        <PartnerForm
          userId={profile.id}
          organizationId={profile.organization_id}
          collectorName={profile.full_name}
          high={w.high}
          medium={w.medium}
          correction={correction}
        />
      ) : null}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Submitted logs"
          value={num(w.logs_count)}
          hint="Every visit, call and correction"
        />
        <StatCard
          label="Unique outlets"
          value={num(w.outlets_count)}
          hint={`${w.current_count} current monthly records`}
        />
        <StatCard
          label="Reported PCs/month"
          value={num(w.total_pcs)}
          hint={`${w.complete_count} outlets with complete brand quantities`}
        />
        <StatCard
          label="Lenovo share"
          value={share}
          hint={`${num(w.lenovo_units)} Lenovo units in the same outlets`}
        />
      </div>
      <p className="mb-5 text-sm text-muted">
        Sales totals use the latest submission per outlet for the selected month.{' '}
        {w.unknown_count} current records have unknown quantities and are excluded from brand
        totals and shares. {w.estimated_count} current records use typical-month estimates.
        These are reported volumes within surveyed outlets.{' '}
        {ba
          ? 'Your view includes your own logs; only records still current across the team contribute to your sales summary.'
          : 'Results refresh every 20 seconds while this page is visible.'}
      </p>
      {!ba && ['super_admin', 'organization_admin'].includes(profile.role) ? (
        <PartnerThresholds high={w.high} medium={w.medium} />
      ) : null}
      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 font-semibold">PCs per month by brand</h2>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs text-muted">
                <th className="py-2">Brand</th>
                <th className="text-right">Units</th>
                <th className="text-right">Share</th>
                <th className="text-right">Outlets selling</th>
              </tr>
            </thead>
            <tbody>
              {PARTNER_BRANDS.map((b) => {
                const r = w.brands.find((x) => x.label === b);
                return (
                  <tr key={b} className="border-b border-ink/5">
                    <td className="py-2">{b}</td>
                    <td className="text-right tabular-nums">{num(r?.units ?? 0)}</td>
                    <td className="text-right">
                      {w.total_pcs
                        ? `${((100 * (r?.units ?? 0)) / w.total_pcs).toFixed(1)}%`
                        : '—'}
                    </td>
                    <td className="text-right">{r?.companies ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
        {breakdown('Partner priority', w.priorities)}
        {breakdown('By state', w.states, true)}
        {breakdown('Additional products sold', w.products)}
        {breakdown('Main customers', w.customers)}
        {breakdown('Sells mostly', w.mostly)}
      </div>
      {!ba ? (
        <Card className="mb-5 p-4">
          <h2 className="mb-3 font-semibold">Merchandiser activity for this month</h2>
          <div className="flex flex-wrap gap-4 text-sm">
            {w.collectors.map((c) => (
              <p key={`${c.id}:${c.name}`}>
                {c.name}: <strong>{c.logs} logs</strong>
              </p>
            ))}
            {!w.collectors.length ? <p className="text-muted">No submitted logs.</p> : null}
          </div>
        </Card>
      ) : null}
      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">{ba ? 'My submitted logs' : 'All submitted logs'}</h2>
          {!ba ? (
            <div className="flex flex-wrap gap-3 text-sm">
              <a
                className="font-semibold text-primary underline"
                href={`/api/reports/partners?${exportParams}`}
              >
                Export logs to CSV
              </a>
              <a
                className="font-semibold text-primary underline"
                href={`/api/reports/partners?${exportParams}&summary=1`}
              >
                Export summary to CSV
              </a>
            </div>
          ) : null}
        </div>
        <div className="space-y-3">
          {w.logs.map((l) => (
            <details key={l.id} className="rounded-lg border border-ink/10 p-3">
              <summary className="cursor-pointer text-sm">
                <span className="font-semibold">
                  {l.payload.company_name}
                  {l.payload.branch ? ` / ${l.payload.branch}` : ''}
                </span>{' '}
                — {l.payload.city}, {l.payload.state}
                <span className="mt-1 block text-xs text-muted">
                  {l.visit_date} · {l.collector_name} · {l.total_pcs ?? 'Unknown'} PCs/month ·{' '}
                  {l.priority} priority ·{' '}
                  {l.revision === 1 ? 'Current monthly record' : 'Earlier submission'}
                  {l.correction_of ? ' · Correction' : ''}
                </span>
              </summary>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries({
                  Date: l.visit_date,
                  'Reporting month': l.reporting_month.slice(0, 7),
                  'Visit method': l.payload.visit_method,
                  'Sales basis': l.payload.sales_basis,
                  'Contact person': l.payload.contact_person,
                  Phone: l.payload.phone || 'Not provided',
                  Email: l.payload.email || 'Not provided',
                  Employees: l.payload.employees ?? 'Unknown',
                  ...l.payload.sales,
                  'Other brand names': l.payload.other_brand_names || 'None provided',
                  'Total PCs/month': l.total_pcs ?? 'Unknown',
                  'Lenovo share': l.total_pcs
                    ? `${((100 * (l.lenovo_units ?? 0)) / l.total_pcs).toFixed(1)}%`
                    : 'Not available',
                  'Sells mostly': l.payload.sells_mostly,
                  ...l.payload.products,
                  'Main customers': l.payload.main_customers,
                  Priority: l.priority,
                  'Collected by': l.collector_name,
                  Notes: l.payload.notes || 'None',
                  'Submitted (Lagos)': formatLagosDisplay(l.created_at),
                  'Log ID': l.id,
                  'Corrects log': l.correction_of || '—',
                }).map(([k, v]) => (
                  <div className="min-w-0" key={k}>
                    <dt className="text-xs text-muted">{k}</dt>
                    <dd className="break-words">{String(v)}</dd>
                  </div>
                ))}
              </dl>
              {ba ? (
                <Link
                  className="mt-4 inline-block text-sm font-semibold text-primary underline"
                  href={`${basePath}?month=${l.reporting_month.slice(0, 7)}&correct=${l.id}`}
                >
                  Correct this log
                </Link>
              ) : null}
            </details>
          ))}
          {!w.logs.length ? (
            <p className="py-6 text-sm text-muted">
              No submitted partner logs match these filters.
            </p>
          ) : null}
        </div>
        <div className="mt-4 flex items-center gap-4 text-sm">
          {filters.p_page > 1 ? (
            <Link className="text-primary underline" href={pageLink(filters.p_page - 1)}>
              Previous
            </Link>
          ) : null}
          <span>
            Page {filters.p_page} of {Math.max(1, Math.ceil(w.logs_count / 30))}
          </span>
          {filters.p_page * 30 < w.logs_count ? (
            <Link className="text-primary underline" href={pageLink(filters.p_page + 1)}>
              Next
            </Link>
          ) : null}
        </div>
      </Card>
    </>
  );
}
