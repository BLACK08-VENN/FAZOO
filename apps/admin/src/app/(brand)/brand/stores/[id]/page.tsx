import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireClient } from '@/lib/client-auth';
import { PageHeader, StatCard } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyRow, Table, TableWrap, Td, Th } from '@/components/ui/table';
import { AttendanceBar, ProgressBar } from '@/components/brand-analytics';
import { TrendsChart } from '../../../../(portal)/overview/trends-chart';
import { ActivityTable } from '../../../_components/activity-table';
import {
  attendanceMix,
  campaignPerformance,
  loadBrandCampaigns,
  loadBrandLogs,
  loadBrandStore,
  summarizeLogs,
  toActivityLogs,
  trendFromLogs,
} from '@/server/brand-analytics';

export default async function BrandStoreDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { client, profile } = await requireClient();
  if (profile.role === 'brand_ambassador') redirect('/brand');
  const { id } = await params;

  const store = await loadBrandStore(client, id);
  if (!store) notFound();

  const [logs, campaigns] = await Promise.all([
    loadBrandLogs(client, { storeId: id }),
    loadBrandCampaigns(client),
  ]);

  const summary = summarizeLogs(logs);
  const trend = trendFromLogs(logs);
  const campaignRows = campaignPerformance(campaigns, logs).filter((row) => row.logs > 0);
  const mix = attendanceMix(logs);
  const fieldMembers = new Set(logs.map((log) => log.ba_id)).size;
  const recent = logs.slice(0, 50);
  const lastVisit = logs.find((log) => log.attendance_status === 'present')?.attendance_date ?? null;

  return (
    <>
      <PageHeader
        title={store.name}
        description={`${store.address ?? 'No address recorded'} · ${
          lastVisit ? `Last visited ${lastVisit}` : 'Not visited yet'
        }`}
      >
        <Link
          href="/brand/stores"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ink/15 bg-white px-4 text-sm font-medium text-ink hover:bg-lavender"
        >
          Store coverage
        </Link>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Visits" value={summary.present} />
        <StatCard label="Field days" value={summary.logs} />
        <StatCard label="Units sold" value={summary.units} />
        <StatCard label="Field members" value={fieldMembers} />
        <StatCard label="Completion" value={`${summary.completionRate}%`} />
        <StatCard label="Flagged reports" value={summary.flagged} />
      </div>

      <Card className="mt-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink">Coverage health</p>
            <p className="mt-0.5 text-xs text-muted">
              Attendance excludes approved weekly-off days.
            </p>
          </div>
          <Badge tone={store.status === 'active' ? 'success' : 'neutral'}>{store.status}</Badge>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <ProgressBar value={summary.completionRate} label="Report completion" />
          <ProgressBar value={summary.attendanceRate} label="Attendance" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <Badge tone="success">{summary.present} present</Badge>
          <Badge tone="warning">{summary.sickLeave} sick leave</Badge>
          <Badge tone="danger">{summary.absent} absent</Badge>
          <Badge tone="purple">{summary.weeklyOff} weekly off</Badge>
        </div>
      </Card>

      <Card className="mt-6">
        <div className="border-b border-ink/8 px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">Sales &amp; completion</h2>
          <p className="mt-0.5 text-xs text-muted">Activity at this store over time.</p>
        </div>
        <TrendsChart data={trend} />
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="border-b border-ink/8 px-5 py-4">
            <h2 className="text-sm font-semibold text-ink">Attendance mix</h2>
            <p className="mt-0.5 text-xs text-muted">
              Field days at this store, without ambassador identities.
            </p>
          </div>
          <div className="p-5">
            <AttendanceBar mix={mix} />
          </div>
        </Card>

        <Card>
          <div className="border-b border-ink/8 px-5 py-4">
            <h2 className="text-sm font-semibold text-ink">By campaign</h2>
          </div>
          <TableWrap className="rounded-none border-0">
            <Table>
              <thead>
                <tr>
                  <Th>Campaign</Th>
                  <Th className="text-right">Visits</Th>
                  <Th className="text-right">Units</Th>
                  <Th className="text-right">Completion</Th>
                </tr>
              </thead>
              <tbody>
                {campaignRows.length === 0 ? (
                  <EmptyRow colSpan={4}>No campaign activity yet.</EmptyRow>
                ) : (
                  campaignRows.map((row) => (
                    <tr key={row.campaign.id} className="hover:bg-lavender/40">
                      <Td>
                        <Link
                          href={`/brand/campaigns/${row.campaign.id}`}
                          className="font-medium text-deep underline underline-offset-2"
                        >
                          {row.campaign.name}
                        </Link>
                        <p className="text-xs text-muted">
                          {row.campaign.start_date} → {row.campaign.end_date ?? 'ongoing'}
                        </p>
                      </Td>
                      <Td className="text-right tabular-nums">{row.present}</Td>
                      <Td className="text-right font-medium tabular-nums">{row.units}</Td>
                      <Td className="text-right tabular-nums">{row.completionRate}%</Td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </TableWrap>
        </Card>
      </div>

      <Card className="mt-6">
        <div className="border-b border-ink/8 px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">Recent activity</h2>
          <p className="mt-0.5 text-xs text-muted">
            Latest {recent.length} log{recent.length === 1 ? '' : 's'} at this store.
          </p>
        </div>
        <ActivityTable
          logs={toActivityLogs(recent)}
          linkStores={false}
          empty="No activity has been logged at this store yet."
        />
      </Card>
    </>
  );
}

export function generateMetadata() {
  return { title: 'Store detail — Brand Dashboard' };
}
