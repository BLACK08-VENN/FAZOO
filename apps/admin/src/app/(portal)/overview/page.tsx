import { requireStaff } from '@/lib/auth';
import { fetchLogs, parseLogFilters, resolveRange, type LogRow } from '@/lib/logs-query';
import { resolveOrgKind } from '@/lib/nav';
import { LogFiltersForm } from '@/components/filters';
import { PageHeader, StatCard } from '@/components/page';
import { SectionCards } from '@/components/section-cards';
import { Card } from '@/components/ui/card';
import { TrendsChart, type TrendPoint } from './trends-chart';
import { SchoolsOverview } from './schools-overview';
import { RecentActivity } from '@/components/recent-activity';
import { StoreHeatmap } from '@/components/store-heatmap';
import type { FazooClient } from '@fazoo/database';
import type { LogFilters } from '@fazoo/validation';

const DAY_MS = 86_400_000;

/** Shift a resolved range back by its own length to get the prior period. */
function previousRange(range: { from: string; to: string }): { from: string; to: string } {
  const fromMs = Date.parse(`${range.from}T00:00:00Z`);
  const toMs = Date.parse(`${range.to}T00:00:00Z`);
  const days = Math.max(1, Math.round((toMs - fromMs) / DAY_MS) + 1);
  const prevTo = new Date(fromMs - DAY_MS);
  const prevFrom = new Date(fromMs - days * DAY_MS);
  return { from: prevFrom.toISOString().slice(0, 10), to: prevTo.toISOString().slice(0, 10) };
}

function shiftedFilters(filters: LogFilters, range: { from: string; to: string }): LogFilters {
  return { ...filters, preset: 'custom', from: range.from, to: range.to };
}

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

  // A schools org has no stores, campaigns or daily logs, so the retail
  // aggregate below would render an all-zero landing page. Hand those admins
  // the booklist pipeline view instead.
  const orgKind = await resolveOrgKind(client);
  if (orgKind === 'schools') return <SchoolsOverview client={client} />;

  const params = await searchParams;
  const filters = parseLogFilters(params);
  const options = await loadFilterOptions(client);

  const rows = await fetchLogs(client, filters, 5000);
  const stats = aggregate(rows);

  const range = resolveRange(filters);
  const prevFilters = shiftedFilters(filters, previousRange(range));
  const prevRows = await fetchLogs(client, prevFilters, 5000);
  const prevStats = aggregate(prevRows);

  const delta = (current: number, previous: number): number | null =>
    previous === 0 ? null : ((current - previous) / previous) * 100;

  return (
    <>
      <PageHeader
        title="Overview"
        description="Attendance and sales across the selected range."
      />

      <Card className="mb-5 p-4 sm:mb-6 sm:p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink">Sections</h2>
        <SectionCards orgKind="retail" />
      </Card>

      <Card className="mb-5 p-3 sm:mb-6 sm:p-4">
        <LogFiltersForm
          action="/overview"
          campaigns={options.campaigns}
          bas={options.bas}
          stores={options.stores}
          current={Object.fromEntries(
            Object.entries(filters).map(([k, v]) => [k, v as string]),
          )}
        />
      </Card>

      <div className="grid grid-cols-1 gap-2.5 min-[380px]:grid-cols-2 sm:gap-4 md:grid-cols-4">
        <StatCard
          label="BA-days"
          value={stats.baDays}
          delta={delta(stats.baDays, prevStats.baDays)}
        />
        <StatCard
          label="Units sold"
          value={stats.units}
          delta={delta(stats.units, prevStats.units)}
        />
        <StatCard
          label="Completed days"
          value={stats.completed}
          delta={delta(stats.completed, prevStats.completed)}
        />
        <StatCard
          label="Open / incomplete"
          value={stats.open}
          delta={delta(stats.open, prevStats.open)}
        />
        <StatCard
          label="Active BAs"
          value={stats.activeBas}
          delta={delta(stats.activeBas, prevStats.activeBas)}
        />
        <StatCard
          label="Active stores"
          value={stats.activeStores}
          delta={delta(stats.activeStores, prevStats.activeStores)}
        />
        <StatCard
          label="Sick-leave days"
          value={stats.sick}
          delta={delta(stats.sick, prevStats.sick)}
        />
        <StatCard
          label="Completion rate"
          value={`${stats.baDays ? Math.round((stats.completed / stats.baDays) * 100) : 0}%`}
          hint="Completed ÷ BA-days"
          delta={delta(
            stats.baDays ? (stats.completed / stats.baDays) * 100 : 0,
            prevStats.baDays ? (prevStats.completed / prevStats.baDays) * 100 : 0,
          )}
        />
      </div>

      <Card className="mt-6">
        <div className="border-b border-ink/8 px-4 py-4 sm:px-5">
          <h2 className="text-sm font-semibold text-ink">Sales &amp; completion trends</h2>
          <p className="mt-0.5 text-xs text-muted">
            Units and completion rate per day in the selected range.
          </p>
        </div>
        <TrendsChart data={stats.trend} />
      </Card>

      <StoreHeatmap rows={rows} />

      <RecentActivity client={client} />
    </>
  );
}
