import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireClient } from '@/lib/client-auth';
import { PageHeader, StatCard } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { EmptyRow, Table, TableWrap, Td, Th } from '@/components/ui/table';
import { ProgressBar } from '@/components/brand-analytics';
import {
  baPerformance,
  loadBrandBas,
  loadBrandCampaigns,
  loadBrandLogs,
  summarizeLogs,
} from '@/server/brand-analytics';

export default async function BrandBasPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string; from?: string; to?: string }>;
}) {
  const { client, profile } = await requireClient();
  if (profile.role === 'brand_ambassador') redirect('/brand');
  const params = await searchParams;

  const campaigns = await loadBrandCampaigns(client);
  const campaignId = campaigns.some((campaign) => campaign.id === params.campaign)
    ? params.campaign
    : undefined;
  const from = params.from?.trim() || undefined;
  const to = params.to?.trim() || undefined;

  const [bas, logs] = await Promise.all([
    loadBrandBas(client),
    loadBrandLogs(client, { campaignId, from, to }),
  ]);

  const rows = baPerformance(bas, logs);
  const summary = summarizeLogs(logs);
  const activeBas = rows.filter((row) => row.logs > 0).length;
  const noActivity = rows.length - activeBas;

  return (
    <>
      <PageHeader
        title="Team performance"
        description="Monitor how each brand ambassador is performing — attendance, reporting, sales and flags."
      >
        <Link
          href="/brand/bas"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ink/15 bg-white px-4 text-sm font-medium text-ink hover:bg-lavender"
        >
          Reset filters
        </Link>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Brand ambassadors" value={rows.length} hint={`${activeBas} active`} />
        <StatCard label="BA-days" value={summary.logs} />
        <StatCard label="Units sold" value={summary.units} />
        <StatCard label="Completion" value={`${summary.completionRate}%`} />
        <StatCard label="Attendance" value={`${summary.attendanceRate}%`} />
        <StatCard label="Flagged reports" value={summary.flagged} />
      </div>

      <Card className="mt-5 p-4">
        <form
          method="get"
          action="/brand/bas"
          role="search"
          aria-label="Filter team performance"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div>
            <Label htmlFor="ba-campaign">Campaign</Label>
            <Select id="ba-campaign" name="campaign" defaultValue={campaignId ?? ''}>
              <option value="">All campaigns</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="ba-from">From</Label>
            <Input id="ba-from" name="from" type="date" defaultValue={from ?? ''} />
          </div>
          <div>
            <Label htmlFor="ba-to">To</Label>
            <Input id="ba-to" name="to" type="date" defaultValue={to ?? ''} />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="h-10 flex-1 rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Apply
            </button>
            <Link
              href="/brand/bas"
              className="inline-flex h-10 items-center rounded-lg border border-ink/15 bg-white px-4 text-sm font-medium text-ink hover:bg-lavender"
            >
              Reset
            </Link>
          </div>
        </form>
        <p className="mt-3 text-xs text-muted">
          Leave the dates blank to report all time. Attendance excludes approved weekly-off days.
        </p>
      </Card>

      {noActivity > 0 ? (
        <Card className="mt-5 border-warn/30 bg-warn/5 p-4">
          <p className="text-sm font-medium text-ink">
            {noActivity} brand ambassador{noActivity === 1 ? ' has' : 's have'} no activity in this
            period.
          </p>
          <p className="mt-1 text-xs text-muted">
            They are listed at the bottom so you can follow up on assignments or onboarding.
          </p>
        </Card>
      ) : null}

      <div className="mt-6 space-y-3 md:hidden" role="list" aria-label="Brand ambassador performance">
        {rows.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-sm text-muted">No brand ambassadors in your workspace yet.</p>
          </Card>
        ) : (
          rows.map((row) => (
            <Card key={row.ba.id} className="p-4" role="listitem">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/brand/bas/${row.ba.id}`}
                    className="truncate text-base font-semibold text-deep underline underline-offset-2"
                  >
                    {row.ba.full_name}
                  </Link>
                  {row.ba.phone ? (
                    <p className="mt-0.5 text-xs text-muted">{row.ba.phone}</p>
                  ) : null}
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {row.campaignNames.length > 0
                      ? row.campaignNames.join(', ')
                      : 'No campaign activity'}
                  </p>
                </div>
                {row.flagged > 0 ? <Badge tone="danger">{row.flagged} flagged</Badge> : null}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted">Units</p>
                  <p className="mt-0.5 text-xl font-bold tabular-nums text-ink">{row.units}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted">BA-days</p>
                  <p className="mt-0.5 text-xl font-bold tabular-nums text-ink">{row.logs}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted">Stores</p>
                  <p className="mt-0.5 text-xl font-bold tabular-nums text-ink">{row.stores}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted">Last active</p>
                  <p className="mt-0.5 text-sm font-medium text-ink">{row.lastActive ?? '—'}</p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <ProgressBar value={row.completionRate} label="Report completion" />
                <ProgressBar value={row.attendanceRate} label="Attendance" />
              </div>
            </Card>
          ))
        )}
      </div>

      <TableWrap className="mt-6 hidden md:block">
        <Table>
          <caption className="sr-only">Brand ambassador performance</caption>
          <thead>
            <tr>
              <Th>Brand ambassador</Th>
              <Th>Campaigns</Th>
              <Th className="text-right">Days</Th>
              <Th className="text-right">Units</Th>
              <Th className="text-right">Completion</Th>
              <Th className="text-right">Attendance</Th>
              <Th className="text-right">Flagged</Th>
              <Th className="text-right">Last active</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={8}>No brand ambassadors in your workspace yet.</EmptyRow>
            ) : (
              rows.map((row) => (
                <tr key={row.ba.id} className="hover:bg-lavender/40">
                  <Td>
                    <Link
                      href={`/brand/bas/${row.ba.id}`}
                      className="font-medium text-deep underline underline-offset-2"
                    >
                      {row.ba.full_name}
                    </Link>
                    {row.ba.phone ? (
                      <p className="text-xs text-muted">{row.ba.phone}</p>
                    ) : null}
                  </Td>
                  <Td className="max-w-[220px] text-xs text-muted">
                    {row.campaignNames.length > 0 ? row.campaignNames.join(', ') : '—'}
                  </Td>
                  <Td className="text-right tabular-nums">{row.logs}</Td>
                  <Td className="text-right font-medium tabular-nums">{row.units}</Td>
                  <Td className="text-right tabular-nums">{row.completionRate}%</Td>
                  <Td className="text-right tabular-nums">{row.attendanceRate}%</Td>
                  <Td className="text-right tabular-nums">
                    {row.flagged > 0 ? (
                      <span className="font-medium text-bad">{row.flagged}</span>
                    ) : (
                      <span className="text-muted">0</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-right text-xs tabular-nums">
                    {row.lastActive ?? '—'}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </TableWrap>
    </>
  );
}

export function generateMetadata() {
  return { title: 'Team performance — Brand Dashboard' };
}
