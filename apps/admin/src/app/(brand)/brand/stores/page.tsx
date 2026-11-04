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
  loadBrandCampaigns,
  loadBrandLogs,
  loadBrandStores,
  storePerformance,
  summarizeLogs,
} from '@/server/brand-analytics';

export default async function BrandStoresPage({
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

  const [stores, logs] = await Promise.all([
    loadBrandStores(client),
    loadBrandLogs(client, { campaignId, from, to }),
  ]);

  const rows = storePerformance(stores, logs);
  const summary = summarizeLogs(logs);
  const visited = rows.filter((row) => row.present > 0).length;
  const notVisited = rows.length - visited;

  return (
    <>
      <PageHeader
        title="Store coverage"
        description="See which stores are being visited, how often, and how field coverage is distributed."
      >
        <Link
          href="/brand/campaigns"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ink/15 bg-white px-4 text-sm font-medium text-ink hover:bg-lavender"
        >
          Campaign analytics
        </Link>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Stores" value={rows.length} hint={`${visited} visited`} />
        <StatCard label="Visits" value={summary.present} hint="present field days" />
        <StatCard label="Units sold" value={summary.units} />
        <StatCard label="Completion" value={`${summary.completionRate}%`} />
        <StatCard label="Not visited" value={notVisited} />
        <StatCard label="Flagged reports" value={summary.flagged} />
      </div>

      <Card className="mt-5 p-4">
        <form
          method="get"
          action="/brand/stores"
          role="search"
          aria-label="Filter store coverage"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div>
            <Label htmlFor="store-campaign">Campaign</Label>
            <Select id="store-campaign" name="campaign" defaultValue={campaignId ?? ''}>
              <option value="">All campaigns</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="store-from">From</Label>
            <Input id="store-from" name="from" type="date" defaultValue={from ?? ''} />
          </div>
          <div>
            <Label htmlFor="store-to">To</Label>
            <Input id="store-to" name="to" type="date" defaultValue={to ?? ''} />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="h-10 flex-1 rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Apply
            </button>
            <Link
              href="/brand/stores"
              className="inline-flex h-10 items-center rounded-lg border border-ink/15 bg-white px-4 text-sm font-medium text-ink hover:bg-lavender"
            >
              Reset
            </Link>
          </div>
        </form>
        <p className="mt-3 text-xs text-muted">
          Leave the dates blank to report all time.
        </p>
      </Card>

      {notVisited > 0 ? (
        <Card className="mt-5 border-warn/30 bg-warn/5 p-4">
          <p className="text-sm font-medium text-ink">
            {notVisited} store{notVisited === 1 ? ' has' : 's have'} not been visited in this period.
          </p>
          <p className="mt-1 text-xs text-muted">
            They are listed at the bottom so you can check assignments and coverage gaps.
          </p>
        </Card>
      ) : null}

      <div className="mt-6 space-y-3 md:hidden" role="list" aria-label="Store coverage">
        {rows.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-sm text-muted">No stores in your workspace yet.</p>
          </Card>
        ) : (
          rows.map((row) => (
            <Card key={row.store.id} className="p-4" role="listitem">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/brand/stores/${row.store.id}`}
                    className="truncate text-base font-semibold text-deep underline underline-offset-2"
                  >
                    {row.store.name}
                  </Link>
                  {row.store.address ? (
                    <p className="mt-0.5 truncate text-xs text-muted">{row.store.address}</p>
                  ) : null}
                </div>
                <Badge tone={row.store.status === 'active' ? 'success' : 'neutral'}>
                  {row.store.status}
                </Badge>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted">Visits</p>
                  <p className="mt-0.5 text-xl font-bold tabular-nums text-ink">{row.present}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted">Units</p>
                  <p className="mt-0.5 text-xl font-bold tabular-nums text-ink">{row.units}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted">Field team</p>
                  <p className="mt-0.5 text-xl font-bold tabular-nums text-ink">{row.bas}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted">Last visit</p>
                  <p className="mt-0.5 text-sm font-medium text-ink">{row.lastVisit ?? '—'}</p>
                </div>
              </div>

              <div className="mt-4">
                <ProgressBar value={row.completionRate} label="Report completion" />
              </div>
            </Card>
          ))
        )}
      </div>

      <TableWrap className="mt-6 hidden md:block">
        <Table>
          <caption className="sr-only">Store coverage</caption>
          <thead>
            <tr>
              <Th>Store</Th>
              <Th>Status</Th>
              <Th className="text-right">Visits</Th>
              <Th className="text-right">Field team</Th>
              <Th className="text-right">Units</Th>
              <Th className="text-right">Completion</Th>
              <Th className="text-right">Flagged</Th>
              <Th className="text-right">Last visit</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={8}>No stores in your workspace yet.</EmptyRow>
            ) : (
              rows.map((row) => (
                <tr key={row.store.id} className="hover:bg-lavender/40">
                  <Td>
                    <Link
                      href={`/brand/stores/${row.store.id}`}
                      className="font-medium text-deep underline underline-offset-2"
                    >
                      {row.store.name}
                    </Link>
                    {row.store.address ? (
                      <p className="max-w-[280px] truncate text-xs text-muted">
                        {row.store.address}
                      </p>
                    ) : null}
                  </Td>
                  <Td>
                    <Badge tone={row.store.status === 'active' ? 'success' : 'neutral'}>
                      {row.store.status}
                    </Badge>
                  </Td>
                  <Td className="text-right tabular-nums">{row.present}</Td>
                  <Td className="text-right tabular-nums">{row.bas}</Td>
                  <Td className="text-right font-medium tabular-nums">{row.units}</Td>
                  <Td className="text-right tabular-nums">{row.completionRate}%</Td>
                  <Td className="text-right tabular-nums">
                    {row.flagged > 0 ? (
                      <span className="font-medium text-bad">{row.flagged}</span>
                    ) : (
                      <span className="text-muted">0</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-right text-xs tabular-nums">
                    {row.lastVisit ?? '—'}
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
  return { title: 'Store coverage — Brand Dashboard' };
}
