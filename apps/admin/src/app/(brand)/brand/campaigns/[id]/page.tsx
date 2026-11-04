import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireClient } from '@/lib/client-auth';
import { PageHeader, StatCard } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyRow, Table, TableWrap, Td, Th } from '@/components/ui/table';
import {
  AttendanceBar,
  ProgressBar,
  campaignStatusLabel,
  campaignStatusTone,
} from '@/components/brand-analytics';
import { TrendsChart } from '../../../../(portal)/overview/trends-chart';
import { ActivityTable } from '../../../_components/activity-table';
import {
  attendanceMix,
  campaignTimeline,
  loadBrandCampaign,
  loadBrandLogs,
  loadBrandStores,
  skuBreakdown,
  storePerformance,
  summarizeLogs,
  toActivityLogs,
  trendFromLogs,
} from '@/server/brand-analytics';

export default async function BrandCampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { client, profile } = await requireClient();
  if (profile.role === 'brand_ambassador') redirect('/brand');
  const { id } = await params;

  const campaign = await loadBrandCampaign(client, id);
  if (!campaign) notFound();

  const [logs, stores] = await Promise.all([
    loadBrandLogs(client, { campaignId: id }),
    loadBrandStores(client),
  ]);

  const summary = summarizeLogs(logs);
  const trend = trendFromLogs(logs);
  const timeline = campaignTimeline(campaign);
  const storeRows = storePerformance(stores, logs).filter((row) => row.logs > 0);
  const skus = skuBreakdown(logs);
  const mix = attendanceMix(logs);
  const fieldMembers = new Set(logs.map((log) => log.ba_id)).size;
  const recent = logs.slice(0, 50);

  const timelineLabel =
    timeline.phase === 'upcoming'
      ? `Starts in ${timeline.daysLeft ?? 0} day${timeline.daysLeft === 1 ? '' : 's'}`
      : timeline.phase === 'ended'
        ? 'Campaign ended'
        : timeline.totalDays === null
          ? 'Ongoing — no end date'
          : `${timeline.daysLeft ?? 0} day${timeline.daysLeft === 1 ? '' : 's'} left of ${timeline.totalDays}`;

  return (
    <>
      <PageHeader
        title={campaign.name}
        description={`${campaign.start_date} → ${campaign.end_date ?? 'ongoing'}${
          campaign.description ? ` · ${campaign.description}` : ''
        }`}
      >
        <Link
          href="/brand/campaigns"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ink/15 bg-white px-4 text-sm font-medium text-ink hover:bg-lavender"
        >
          All campaigns
        </Link>
        <Link
          href="/brand/stores"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ink/15 bg-white px-4 text-sm font-medium text-ink hover:bg-lavender"
        >
          Store coverage
        </Link>
      </PageHeader>

      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink">Campaign progress</p>
            <p className="mt-0.5 text-xs text-muted">{timelineLabel}</p>
          </div>
          <Badge tone={campaignStatusTone(campaign.status)}>
            {campaignStatusLabel(campaign.status)}
          </Badge>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {timeline.totalDays !== null ? (
            <ProgressBar value={timeline.elapsedPct} label="Time elapsed" />
          ) : null}
          <ProgressBar
            value={summary.completionRate}
            label={`Reports completed · ${summary.completed} of ${summary.logs}`}
          />
        </div>
      </Card>

      {campaign.review_note ? (
        <Card className="mt-4 p-4">
          <p className="text-xs text-muted">
            <span className="font-semibold text-ink">Administrator note:</span>{' '}
            {campaign.review_note}
          </p>
        </Card>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Field days" value={summary.logs} />
        <StatCard label="Completion" value={`${summary.completionRate}%`} />
        <StatCard label="Units sold" value={summary.units} />
        <StatCard label="Field members" value={fieldMembers} />
        <StatCard label="Stores covered" value={storeRows.length} />
        <StatCard label="Flagged reports" value={summary.flagged} />
      </div>

      <Card className="mt-6">
        <div className="border-b border-ink/8 px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">Sales &amp; completion</h2>
          <p className="mt-0.5 text-xs text-muted">
            Units and reporting completion per day for this campaign.
          </p>
        </div>
        <TrendsChart data={trend} />
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="border-b border-ink/8 px-5 py-4">
            <h2 className="text-sm font-semibold text-ink">Attendance mix</h2>
            <p className="mt-0.5 text-xs text-muted">
              Field days for this campaign, without ambassador identities.
            </p>
          </div>
          <div className="p-5">
            <AttendanceBar mix={mix} />
          </div>
        </Card>

        <Card>
          <div className="border-b border-ink/8 px-5 py-4">
            <h2 className="text-sm font-semibold text-ink">Store coverage</h2>
            <p className="mt-0.5 text-xs text-muted">Stores visited during this campaign.</p>
          </div>
          <TableWrap className="rounded-none border-0">
            <Table>
              <thead>
                <tr>
                  <Th>Store</Th>
                  <Th className="text-right">Visits</Th>
                  <Th className="text-right">Units</Th>
                  <Th className="text-right">Field team</Th>
                  <Th className="text-right">Last visit</Th>
                </tr>
              </thead>
              <tbody>
                {storeRows.length === 0 ? (
                  <EmptyRow colSpan={5}>No stores visited for this campaign yet.</EmptyRow>
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
                        {row.store.address ? (
                          <p className="truncate text-xs text-muted">{row.store.address}</p>
                        ) : null}
                      </Td>
                      <Td className="text-right tabular-nums">{row.present}</Td>
                      <Td className="text-right font-medium tabular-nums">{row.units}</Td>
                      <Td className="text-right tabular-nums">{row.bas}</Td>
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
          <h2 className="text-sm font-semibold text-ink">SKU sales</h2>
          <p className="mt-0.5 text-xs text-muted">Units recorded against each product.</p>
        </div>
        <TableWrap className="rounded-none border-0">
          <Table>
            <thead>
              <tr>
                <Th>SKU</Th>
                <Th className="text-right">Units</Th>
              </tr>
            </thead>
            <tbody>
              {skus.length === 0 ? (
                <EmptyRow colSpan={2}>No SKU sales recorded for this campaign yet.</EmptyRow>
              ) : (
                skus.map((sku) => (
                  <tr key={sku.name}>
                    <Td className="font-medium">{sku.name}</Td>
                    <Td className="text-right font-medium tabular-nums">{sku.quantity}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </TableWrap>
      </Card>

      <Card className="mt-6">
        <div className="border-b border-ink/8 px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">Recent activity</h2>
          <p className="mt-0.5 text-xs text-muted">
            Latest {recent.length} log{recent.length === 1 ? '' : 's'} for this campaign.
          </p>
        </div>
        <ActivityTable
          logs={toActivityLogs(recent)}
          linkCampaigns={false}
          empty="No log activity for this campaign yet."
        />
      </Card>
    </>
  );
}

export function generateMetadata() {
  return { title: 'Campaign detail — Brand Dashboard' };
}
