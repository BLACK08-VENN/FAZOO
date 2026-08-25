import { requireStaff } from '@/lib/auth';
import { fetchLogs, parseLogFilters, type LogRow } from '@/lib/logs-query';
import { LogFiltersForm } from '@/components/filters';
import { PageHeader, StatCard } from '@/components/page';
import { Card } from '@/components/ui/card';
import { TrendsChart, type TrendPoint } from './trends-chart';
import type { FazooClient } from '@fazoo/database';

async function loadFilterOptions(client: FazooClient) {
  const [campaigns, bas, stores] = await Promise.all([
    client.from('campaigns').select('id, name').order('name'),
    client
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'brand_ambassador')
      .order('full_name'),
    client.from('stores').select('id, name').order('name'),
  ]);
  return {
    campaigns: (campaigns.data ?? []).map((c) => ({ id: c.id, label: c.name })),
    bas: (bas.data ?? []).map((b) => ({ id: b.id, label: b.full_name })),
    stores: (stores.data ?? []).map((s) => ({ id: s.id, label: s.name })),
  };
}

function aggregate(rows: LogRow[]) {
  const byDay = new Map<string, { units: number; total: number; completed: number }>();
  const bas = new Set<string>();
  const stores = new Set<string>();

  let units = 0;
  let completed = 0;
  let open = 0;
  let sick = 0;

  for (const r of rows) {
    bas.add(r.ba_id);
    if (r.attendance_status === 'present') stores.add(r.store_id);
    units += r.units_sold;
    if (r.status === 'completed') completed += 1;
    if (r.status === 'open') open += 1;
    if (r.attendance_status === 'sick_leave') sick += 1;

    const day = byDay.get(r.attendance_date) ?? { units: 0, total: 0, completed: 0 };
    day.units += r.units_sold;
    day.total += 1;
    if (r.status === 'completed') day.completed += 1;
    byDay.set(r.attendance_date, day);
  }

  const trend: TrendPoint[] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, v]) => ({
      day,
      units: v.units,
      completionPct: v.total === 0 ? 0 : Math.round((v.completed / v.total) * 100),
    }));

  return {
    baDays: rows.length,
    units,
    completed,
    open,
    sick,
    activeBas: bas.size,
    activeStores: stores.size,
    trend,
  };
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { client } = await requireStaff();
  const params = await searchParams;
  const filters = parseLogFilters(params);
  const options = await loadFilterOptions(client);

  const rows = await fetchLogs(client, filters, 5000);
  const stats = aggregate(rows);

  return (
    <>
      <PageHeader
        title="Overview"
        description="Attendance and sales across the selected range."
      />

      <Card className="mb-6 p-4">
        <LogFiltersForm
          action="/overview"
          campaigns={options.campaigns}
          bas={options.bas}
          stores={options.stores}
          current={Object.fromEntries(Object.entries(filters).map(([k, v]) => [k, v as string]))}
        />
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="BA-days" value={stats.baDays} />
        <StatCard label="Units sold" value={stats.units} />
        <StatCard label="Completed days" value={stats.completed} />
        <StatCard label="Open / incomplete" value={stats.open} />
        <StatCard label="Active BAs" value={stats.activeBas} />
        <StatCard label="Active stores" value={stats.activeStores} />
        <StatCard label="Sick-leave days" value={stats.sick} />
        <StatCard
          label="Completion rate"
          value={`${stats.baDays ? Math.round((stats.completed / stats.baDays) * 100) : 0}%`}
          hint="Completed ÷ BA-days"
        />
      </div>

      <Card className="mt-6">
        <div className="border-b border-ink/8 px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">Sales &amp; completion trends</h2>
        </div>
        <TrendsChart data={stats.trend} />
      </Card>
    </>
  );
}
