import { requireClient } from '@/lib/client-auth';
import { PageHeader, StatCard } from '@/components/page';
import { Card } from '@/components/ui/card';
import { TrendsChart, type TrendPoint } from '../../(portal)/overview/trends-chart';

export default async function BrandOverviewPage() {
  const { client } = await requireClient();

  const { data: campaigns } = await client
    .from('campaigns')
    .select('id, name, status, start_date, end_date')
    .order('start_date', { ascending: false });

  const campaignIds = (campaigns ?? []).map((c) => c.id);

  let allLogs: Array<{
    attendance_date: string;
    attendance_status: string;
    status: string;
    units_sold: number;
    ba_id: string;
    store_id: string;
    campaign_id: string;
  }> = [];

  if (campaignIds.length > 0) {
    const { data: logs } = await client
      .from('daily_logs')
      .select(`
        attendance_date, attendance_status, status,
        brand_ambassador_id, store_id, campaign_id,
        sales_entries ( quantity )
      `)
      .in('campaign_id', campaignIds)
      .order('attendance_date', { ascending: false })
      .limit(5000);

    allLogs = (logs ?? []).map((r: Record<string, unknown>) => ({
      attendance_date: r.attendance_date as string,
      attendance_status: r.attendance_status as string,
      status: r.status as string,
      units_sold: ((r.sales_entries as Array<{ quantity: number }> | null) ?? []).reduce(
        (s, e) => s + e.quantity,
        0,
      ),
      ba_id: r.brand_ambassador_id as string,
      store_id: r.store_id as string,
      campaign_id: r.campaign_id as string,
    }));
  }

  const bas = new Set(allLogs.map((r) => r.ba_id));
  const stores = new Set(allLogs.filter((r) => r.attendance_status === 'present').map((r) => r.store_id));
  const units = allLogs.reduce((s, r) => s + r.units_sold, 0);
  const completed = allLogs.filter((r) => r.status === 'completed').length;
  const open = allLogs.filter((r) => r.status === 'open').length;

  const byDay = new Map<string, { units: number; total: number; completed: number }>();
  for (const r of allLogs) {
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

  const activeCampaigns = (campaigns ?? []).filter((c) => c.status === 'active').length;

  return (
    <>
      <PageHeader
        title="Campaign Performance"
        description="Aggregate metrics across all campaigns."
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Active campaigns" value={activeCampaigns} />
        <StatCard label="BA-days" value={allLogs.length} />
        <StatCard label="Units sold" value={units} />
        <StatCard label="Completion rate" value={`${allLogs.length ? Math.round((completed / allLogs.length) * 100) : 0}%`} />
        <StatCard label="Active BAs" value={bas.size} />
        <StatCard label="Active stores" value={stores.size} />
        <StatCard label="Completed days" value={completed} />
        <StatCard label="Open / incomplete" value={open} />
      </div>

      <Card className="mt-6">
        <div className="border-b border-ink/8 px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">Sales &amp; completion trends</h2>
          <p className="mt-0.5 text-xs text-muted">Units and completion rate per day across all campaigns.</p>
        </div>
        <TrendsChart data={trend} />
      </Card>

      <Card className="mt-6">
        <div className="border-b border-ink/8 px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">Campaigns</h2>
        </div>
        <div className="divide-y divide-ink/5">
          {(campaigns ?? []).map((c) => {
            const campaignLogs = allLogs.filter((l) => l.campaign_id === c.id);
            const campaignCompleted = campaignLogs.filter((l) => l.status === 'completed').length;
            const campaignUnits = campaignLogs.reduce((s, l) => s + l.units_sold, 0);
            return (
              <div key={c.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-ink">{c.name}</p>
                  <p className="text-xs text-muted">{c.start_date} → {c.end_date ?? 'ongoing'}</p>
                </div>
                <div className="flex gap-6 text-right">
                  <div>
                    <p className="text-sm font-semibold text-ink">{campaignLogs.length}</p>
                    <p className="text-xs text-muted">BA-days</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-ink">{campaignUnits}</p>
                    <p className="text-xs text-muted">Units</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      {campaignLogs.length ? Math.round((campaignCompleted / campaignLogs.length) * 100) : 0}%
                    </p>
                    <p className="text-xs text-muted">Completion</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}

export function generateMetadata() {
  return { title: 'Campaign Performance — Brand Dashboard' };
}
