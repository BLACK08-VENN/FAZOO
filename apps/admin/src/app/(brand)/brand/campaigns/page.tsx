import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireClient } from '@/lib/client-auth';
import { PageHeader, StatCard } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Label, Select } from '@/components/ui/input';
import { ProgressBar } from '@/components/brand-analytics';
import {
  campaignPerformance,
  loadBrandCampaigns,
  loadBrandLogs,
  summarizeLogs,
} from '@/server/brand-analytics';

const STATUSES = ['active', 'completed', 'draft', 'cancelled'] as const;

function isStatus(value: string | undefined): value is (typeof STATUSES)[number] {
  return STATUSES.includes(value as (typeof STATUSES)[number]);
}

export default async function BrandCampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { client, profile } = await requireClient();
  if (profile.role === 'brand_ambassador') redirect('/brand');
  const params = await searchParams;
  const status = isStatus(params.status) ? params.status : null;

  const [campaigns, logs] = await Promise.all([
    loadBrandCampaigns(client),
    loadBrandLogs(client),
  ]);

  const allPerformance = campaignPerformance(campaigns, logs);
  const performance = status
    ? allPerformance.filter((row) => row.campaign.status === status)
    : allPerformance;

  const visibleIds = new Set(performance.map((row) => row.campaign.id));
  const visibleLogs = logs.filter((log) => visibleIds.has(log.campaign_id));
  const summary = summarizeLogs(visibleLogs);
  const active = performance.filter((row) => row.campaign.status === 'active').length;
  const bas = new Set(visibleLogs.map((log) => log.ba_id)).size;
  const stores = new Set(
    visibleLogs
      .filter((log) => log.attendance_status === 'present')
      .map((log) => log.store_id),
  ).size;

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Track how every campaign is progressing in the field — time elapsed, reporting completion, coverage and sales."
      >
        <Link
          href="/brand/bas"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ink/15 bg-white px-4 text-sm font-medium text-ink hover:bg-lavender"
        >
          Team performance
        </Link>
        <Link
          href="/brand/stores"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ink/15 bg-white px-4 text-sm font-medium text-ink hover:bg-lavender"
        >
          Store coverage
        </Link>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Campaigns" value={performance.length} hint={`${active} active`} />
        <StatCard label="BA-days" value={summary.logs} hint={`${summary.completed} completed`} />
        <StatCard label="Units sold" value={summary.units} />
        <StatCard label="Completion" value={`${summary.completionRate}%`} />
        <StatCard label="Active BAs" value={bas} />
        <StatCard label="Stores covered" value={stores} />
      </div>

      <Card className="mt-5 p-4">
        <form
          method="get"
          action="/brand/campaigns"
          role="search"
          aria-label="Filter campaigns"
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="min-w-0 flex-1 sm:max-w-xs">
            <Label htmlFor="campaign-status">Status</Label>
            <Select id="campaign-status" name="status" defaultValue={status ?? ''}>
              <option value="">All campaigns</option>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value.charAt(0).toUpperCase() + value.slice(1)}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Apply
            </button>
            <Link
              href="/brand/campaigns"
              className="inline-flex h-10 items-center rounded-lg border border-ink/15 bg-white px-4 text-sm font-medium text-ink hover:bg-lavender"
            >
              Reset
            </Link>
          </div>
        </form>
      </Card>

      {performance.length === 0 ? (
        <Card className="mt-6 p-8 text-center">
          <p className="text-sm text-muted">
            {status
              ? 'No campaigns match that status.'
              : 'No campaigns have been set up for your brand yet.'}
          </p>
        </Card>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {performance.map((row) => {
            const { campaign, timeline } = row;
            const timelineLabel =
              timeline.phase === 'upcoming'
                ? `Starts in ${timeline.daysLeft ?? 0} day${timeline.daysLeft === 1 ? '' : 's'}`
                : timeline.phase === 'ended'
                  ? 'Campaign ended'
                  : timeline.totalDays === null
                    ? 'Ongoing — no end date'
                    : `${timeline.daysLeft ?? 0} day${timeline.daysLeft === 1 ? '' : 's'} left of ${timeline.totalDays}`;

            return (
              <Link
                key={campaign.id}
                href={`/brand/campaigns/${campaign.id}`}
                className="group block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <Card className="h-full p-4 transition-shadow group-hover:shadow-md sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-ink group-hover:text-deep">
                        {campaign.name}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {campaign.start_date} → {campaign.end_date ?? 'ongoing'}
                      </p>
                    </div>
                    <Badge
                      tone={
                        campaign.status === 'active'
                          ? 'success'
                          : campaign.status === 'completed'
                            ? 'purple'
                            : campaign.status === 'cancelled'
                              ? 'danger'
                              : 'neutral'
                      }
                    >
                      {campaign.status}
                    </Badge>
                  </div>

                  <div className="mt-4 space-y-3">
                    {timeline.totalDays === null ? (
                      <p className="text-xs text-muted">{timelineLabel}</p>
                    ) : (
                      <ProgressBar
                        value={timeline.elapsedPct}
                        label={`Time elapsed · ${timelineLabel}`}
                      />
                    )}
                    <ProgressBar
                      value={row.completionRate}
                      label={`Reports completed · ${row.completed} of ${row.logs}`}
                    />
                  </div>

                  <div className="mt-4 grid grid-cols-4 gap-2 border-t border-ink/8 pt-3 text-center">
                    <div>
                      <p className="text-sm font-bold tabular-nums text-ink">{row.bas}</p>
                      <p className="text-[10px] uppercase tracking-wide text-muted">BAs</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold tabular-nums text-ink">{row.stores}</p>
                      <p className="text-[10px] uppercase tracking-wide text-muted">Stores</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold tabular-nums text-ink">{row.logs}</p>
                      <p className="text-[10px] uppercase tracking-wide text-muted">BA-days</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold tabular-nums text-ink">{row.units}</p>
                      <p className="text-[10px] uppercase tracking-wide text-muted">Units</p>
                    </div>
                  </div>

                  {row.flagged > 0 ? (
                    <p className="mt-3 text-xs font-medium text-bad">
                      {row.flagged} flagged report{row.flagged === 1 ? '' : 's'} need review
                    </p>
                  ) : null}
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

export function generateMetadata() {
  return { title: 'Campaigns — Brand Dashboard' };
}
