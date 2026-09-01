import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import { PageHeader, StatCard } from '@/components/page';
import { Badge } from '@/components/ui/badge';
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

export default async function VedaActivationsPage() {
  const { client, profile } = await requireStaff();

  const { data: org } = await client
    .from('organizations')
    .select('kind')
    .eq('id', profile.organization_id)
    .single();

  if (org?.kind !== 'schools') {
    return (
      <>
        <PageHeader title="Veda Activations" description="School visit tracking." />
        <p className="text-sm text-muted">
          Veda Activations is only available for organizations of kind “schools”.
          This account is a retail brand workspace.
        </p>
      </>
    );
  }

  const { data: raw } = await client
    .from('veda_sessions')
    .select(
      `id,
       session_date, status, learner_count, checkin_at, checkout_at, notes,
       profiles!veda_sessions_brand_ambassador_id_fkey ( id, full_name ),
       veda_schools!veda_sessions_school_id_fkey ( id, name, region ),
       veda_session_distributions ( quantity )`,
    )
    .order('session_date', { ascending: false })
    .limit(500);

  const rows = (raw ?? []) as unknown as ActivationRow[];
  const totalUnits = rows.reduce(
    (s, r) => s + (r.veda_session_distributions ?? []).reduce((n, d) => n + d.quantity, 0),
    0,
  );
  const open = rows.filter((r) => r.status === 'open').length;

  return (
    <>
      <PageHeader
        title="Veda Activations"
        description="School visits, stationery distributions and proof-of-visit photos."
      >
        <div className="flex gap-2">
          <Link
            href="/veda-assignments"
            className="inline-flex h-10 items-center rounded-lg border border-primary/30 bg-white px-4 text-sm font-medium text-primary hover:bg-lavender"
          >
            Assign a visit
          </Link>
          <a
            href="/api/reports/veda-activations"
            className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-deep"
            download
          >
            Download CSV
          </a>
        </div>
      </PageHeader>

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
                No activations yet. Assign a school visit to get started.
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