import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import { PageHeader, StatCard } from '@/components/page';
import { BrandPicker } from '@/components/brand-picker';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { EmptyRow, Table, TableWrap, Td, Th } from '@/components/ui/table';

interface ActivationRow {
  id: string;
  session_date: string;
  status: string;
  learner_count: number;
  checkin_at: string | null;
  checkout_at: string | null;
  notes: string | null;
  profiles: { id: string; full_name: string } | null;
  veda_schools: { id: string; name: string; region: string | null } | null;
  veda_session_distributions: Array<{ quantity: number }> | null;
}

interface BrandOption {
  id: string;
  name: string;
}

export default async function BrandActivationsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; from?: string; to?: string }>;
}) {
  const { client, profile } = await requireStaff();
  const { org, from, to } = await searchParams;

  const { data: brandsRaw } = await client
    .from('organizations')
    .select('id, name')
    .order('name');
  const brands = (brandsRaw ?? []) as BrandOption[];

  const selectedOrg = (() => {
    if (org && brands.some((b) => b.id === org)) return org;
    if (brands.some((b) => b.id === profile.organization_id)) return profile.organization_id;
    return brands[0]?.id;
  })();

  const query = client
    .from('veda_sessions')
    .select(
      `id,
       session_date, status, learner_count, checkin_at, checkout_at, notes,
       profiles!veda_sessions_brand_ambassador_id_fkey ( id, full_name ),
       veda_schools!veda_sessions_school_id_fkey ( id, name, region ),
       veda_session_distributions ( quantity )`,
    )
    .eq('organization_id', selectedOrg ?? '00000000-0000-0000-0000-000000000000')
    .order('session_date', { ascending: false })
    .limit(500);

  const dateQuery =
    from || to
      ? query.gte('session_date', from ?? '0000-01-01').lte('session_date', to ?? '9999-12-31')
      : query;

  const { data: raw } = await dateQuery;

  const rows = (raw ?? []) as unknown as ActivationRow[];
  const totalUnits = rows.reduce(
    (s, r) => s + (r.veda_session_distributions ?? []).reduce((n, d) => n + d.quantity, 0),
    0,
  );
  const open = rows.filter((r) => r.status === 'open').length;

  return (
    <>
      <PageHeader
        title="Brand Activations"
        description="School visits, stationery distributions and proof-of-visit photos."
      >
        <div className="flex flex-wrap items-center gap-2">
          <BrandPicker action="/veda-activations" brands={brands} current={selectedOrg} />
          <Link
            href={
              selectedOrg
                ? `/veda-assignments?org=${encodeURIComponent(selectedOrg)}`
                : '/veda-assignments'
            }
            className="inline-flex h-10 items-center rounded-lg border border-primary/30 bg-white px-4 text-sm font-medium text-primary hover:bg-lavender"
          >
            Assign a visit
          </Link>
          <a
            href={`/api/reports/veda-activations?${new URLSearchParams(
              Object.entries({ org: selectedOrg ?? '', from: from ?? '', to: to ?? '' }).filter(
                ([, v]) => v !== '',
              ),
            )}`}
            className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-deep"
            download
          >
            Download CSV
          </a>
        </div>
      </PageHeader>

      <Card className="mb-6 p-4">
        <form
          method="get"
          action="/veda-activations"
          role="search"
          aria-label="Filter activations by date"
          className="flex flex-wrap items-end gap-3"
        >
          <input type="hidden" name="org" value={selectedOrg ?? ''} />
          <div>
            <Label htmlFor="v-from">From</Label>
            <Input id="v-from" name="from" type="date" defaultValue={from ?? ''} />
          </div>
          <div>
            <Label htmlFor="v-to">To</Label>
            <Input id="v-to" name="to" type="date" defaultValue={to ?? ''} />
          </div>
          <button
            type="submit"
            className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Apply
          </button>
          {(from || to) ? (
            <a
              href={`/veda-activations${selectedOrg ? `?org=${encodeURIComponent(selectedOrg)}` : ''}`}
              className="inline-flex h-10 items-center rounded-lg border border-ink/10 px-4 text-sm font-medium text-muted hover:bg-lavender"
            >
              Clear
            </a>
          ) : null}
        </form>
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Visits" value={rows.length} />
        <StatCard label="Open today" value={open} hint="Not yet checked out" />
        <StatCard label="Units distributed" value={totalUnits} />
      </div>

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Brand Ambassador</Th>
              <Th>School</Th>
              <Th>Learners</Th>
              <Th className="text-right">Units</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={6}>
                No activations for this brand yet. Assign a school visit to get started.
              </EmptyRow>
            ) : (
              rows.map((r) => {
                const units = (r.veda_session_distributions ?? []).reduce(
                  (n, d) => n + d.quantity,
                  0,
                );
                return (
                  <tr key={r.id}>
                    <Td>
                      <Link
                        href={`/veda-activations/${r.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {r.session_date}
                      </Link>
                    </Td>
                    <Td>{r.profiles?.full_name ?? 'Unknown'}</Td>
                    <Td className="text-xs">
                      {r.veda_schools?.name ?? 'Unknown'}
                      {r.veda_schools?.region ? (
                        <span className="block text-muted">{r.veda_schools.region}</span>
                      ) : null}
                    </Td>
                    <Td className="tabular-nums">{r.learner_count}</Td>
                    <Td className="text-right tabular-nums">{units}</Td>
                    <Td>
                      <Badge tone={r.status === 'completed' ? 'success' : r.status === 'open' ? 'warning' : 'neutral'}>
                        {r.status}
                      </Badge>
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>
      </TableWrap>
    </>
  );
}