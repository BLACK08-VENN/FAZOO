import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireClient } from '@/lib/client-auth';
import { PageHeader, StatCard } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyRow, Table, TableWrap, Td, Th } from '@/components/ui/table';
import { ProgressBar } from '@/components/brand-analytics';
import { TrendsChart } from '../../../../(portal)/overview/trends-chart';
import { ActivityTable } from '../../../_components/activity-table';
import {
  campaignPerformance,
  loadBrandBa,
  loadBrandCampaigns,
  loadBrandLogs,
  loadBrandStores,
  storePerformance,
  summarizeLogs,
  trendFromLogs,
} from '@/server/brand-analytics';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export default async function BrandBaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { client, profile } = await requireClient();
  if (profile.role === 'brand_ambassador') redirect('/brand');
  const { id } = await params;

  const ba = await loadBrandBa(client, id);
  if (!ba) notFound();

  const [logs, campaigns, stores] = await Promise.all([
    loadBrandLogs(client, { baId: id }),
    loadBrandCampaigns(client),
    loadBrandStores(client),
  ]);

  const summary = summarizeLogs(logs);
  const trend = trendFromLogs(logs);
  const campaignRows = campaignPerformance(campaigns, logs).filter((row) => row.logs > 0);
  const storeRows = storePerformance(stores, logs).filter((row) => row.logs > 0);
  const recent = logs.slice(0, 50);
  const lastActive = logs[0]?.attendance_date ?? null;

  return (
    <>
      <PageHeader
        title={ba.full_name}
        description={`${ba.phone ?? 'No phone recorded'} · ${lastActive ? `Last active ${lastActive}` : 'No activity yet'}`}
      >
        <Link
          href="/brand/bas"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ink/15 bg-white px-4 text-sm font-medium text-ink hover:bg-lavender"
        >
          Team performance
        </Link>
      </PageHeader>

      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="grid size-16 shrink-0 place-items-center rounded-full bg-primary/10 text-xl font-bold text-primary">
            {initials(ba.full_name)}
          </span>
          <div className="grid flex-1 gap-3 sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Phone</p>
              <p className="mt-0.5 text-sm text-ink">{ba.phone ?? '—'}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                Campaigns worked
              </p>
              <p className="mt-0.5 text-sm text-ink">{campaignRows.length}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                Stores covered
              </p>
              <p className="mt-0.5 text-sm text-ink">{storeRows.length}</p>
            </div>
          </div>
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="BA-days" value={summary.logs} />
        <StatCard label="Units sold" value={summary.units} />
        <StatCard label="Completion" value={`${summary.completionRate}%`} />
        <StatCard label="Attendance" value={`${summary.attendanceRate}%`} />
        <StatCard label="Flagged reports" value={summary.flagged} />
        <StatCard label="Open reports" value={summary.open} />
      </div>

      <Card className="mt-6 p-4 sm:p-5">
        <p className="text-sm font-semibold text-ink">Reliability</p>
        <p className="mt-0.5 text-xs text-muted">
          Attendance excludes approved weekly-off days.
        </p>
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
          <p className="mt-0.5 text-xs text-muted">This ambassador&apos;s daily trend.</p>
        </div>
        <TrendsChart data={trend} />
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="border-b border-ink/8 px-5 py-4">
            <h2 className="text-sm font-semibold text-ink">By campaign</h2>
          </div>
          <TableWrap className="rounded-none border-0">
            <Table>
              <thead>
                <tr>
                  <Th>Campaign</Th>
                  <Th className="text-right">Days</Th>
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
                      <Td className="text-right tabular-nums">{row.logs}</Td>
                      <Td className="text-right font-medium tabular-nums">{row.units}</Td>
                      <Td className="text-right tabular-nums">{row.completionRate}%</Td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </TableWrap>
        </Card>

        <Card>
          <div className="border-b border-ink/8 px-5 py-4">
            <h2 className="text-sm font-semibold text-ink">By store</h2>
          </div>
          <TableWrap className="rounded-none border-0">
            <Table>
              <thead>
                <tr>
                  <Th>Store</Th>
                  <Th className="text-right">Visits</Th>
                  <Th className="text-right">Units</Th>
                  <Th className="text-right">Last visit</Th>
                </tr>
              </thead>
              <tbody>
                {storeRows.length === 0 ? (
                  <EmptyRow colSpan={4}>No store activity yet.</EmptyRow>
                ) : (
                  storeRows.map((row) => (
                    <tr key={row.store.id} className="hover:bg-lavender/40">
                      <Td>
                        <Link
                          href={`/brand/stores/${row.store.id}`}
                          className="font-medium text-deep underline underline-offset-2"
                        >
                          {row.store.name}
                        </Link>
                      </Td>
                      <Td className="text-right tabular-nums">{row.present}</Td>
                      <Td className="text-right font-medium tabular-nums">{row.units}</Td>
                      <Td className="whitespace-nowrap text-right text-xs tabular-nums">
                        {row.lastVisit ?? '—'}
                      </Td>
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
            Latest {recent.length} log{recent.length === 1 ? '' : 's'} from this ambassador.
          </p>
        </div>
        <ActivityTable logs={recent} linkBas={false} empty="This ambassador has not logged any activity yet." />
      </Card>
    </>
  );
}

export function generateMetadata() {
  return { title: 'Brand ambassador — Brand Dashboard' };
}
