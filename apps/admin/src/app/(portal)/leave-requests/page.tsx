import Link from 'next/link';
import { Badge, attendanceTone } from '@/components/ui/badge';
import { EmptyRow, Table, TableWrap, Td, Th } from '@/components/ui/table';
import { PageHeader, StatCard } from '@/components/page';
import { requireStaff } from '@/lib/auth';

type Status = 'pending' | 'approved' | 'denied' | 'cancelled';

export default async function LeaveRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { client } = await requireStaff();
  const { status } = await searchParams;
  const selected = ['pending', 'approved', 'denied', 'cancelled'].includes(status ?? '')
    ? (status as Status)
    : undefined;
  let query = client
    .from('leave_requests')
    .select(
      'id, leave_type, start_date, end_date, status, created_at, profiles!leave_requests_brand_ambassador_id_fkey(full_name, phone), stores(name)',
    )
    .order('created_at', { ascending: false })
    .limit(250);
  if (selected) query = query.eq('status', selected);
  const { data: rows } = await query;

  const { data: allStatuses } = await client.from('leave_requests').select('status');
  const counts = (allStatuses ?? []).reduce<Record<Status, number>>(
    (result, row) => {
      result[row.status] += 1;
      return result;
    },
    { pending: 0, approved: 0, denied: 0, cancelled: 0 },
  );

  return (
    <>
      <PageHeader
        title="Leave Requests"
        description="Review, decide and print BA leave applications from one secure queue."
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Awaiting review"
          value={counts.pending}
          hint="Requires an admin decision"
        />
        <StatCard label="Approved" value={counts.approved} hint="Confirmed leave requests" />
        <StatCard label="Denied" value={counts.denied} hint="Requests not approved" />
      </div>
      <div className="mb-4 flex flex-wrap gap-2" aria-label="Filter leave requests">
        {(
          [
            ['', 'All'],
            ['pending', 'Pending'],
            ['approved', 'Approved'],
            ['denied', 'Denied'],
          ] as const
        ).map(([value, label]) => (
          <Link
            key={value}
            href={value ? `/leave-requests?status=${value}` : '/leave-requests'}
            className={`rounded-full border px-4 py-2 text-sm font-semibold ${selected === value || (!selected && !value) ? 'border-primary bg-primary text-white' : 'border-ink/10 bg-white text-charcoal hover:border-primary/40'}`}
          >
            {label}
          </Link>
        ))}
      </div>
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Submitted by</Th>
              <Th>Store</Th>
              <Th>Leave type</Th>
              <Th>Dates</Th>
              <Th>Status</Th>
              <Th>Action</Th>
            </tr>
          </thead>
          <tbody>
            {!rows?.length ? (
              <EmptyRow colSpan={6}>No leave requests match this filter.</EmptyRow>
            ) : (
              rows.map((row) => {
                const ba = row.profiles as unknown as {
                  full_name: string;
                  phone: string;
                } | null;
                const store = row.stores as unknown as { name: string } | null;
                return (
                  <tr key={row.id} className="hover:bg-lavender/60">
                    <Td>
                      <p className="font-semibold text-ink">{ba?.full_name ?? 'Unknown BA'}</p>
                      <p className="text-xs text-muted">{ba?.phone}</p>
                    </Td>
                    <Td>{store?.name ?? '—'}</Td>
                    <Td className="capitalize">{row.leave_type.replaceAll('_', ' ')}</Td>
                    <Td>
                      <p>
                        {row.start_date} — {row.end_date}
                      </p>
                      <p className="text-xs text-muted">
                        Submitted {new Date(row.created_at).toLocaleDateString('en-NG')}
                      </p>
                    </Td>
                    <Td>
                      <Badge tone={attendanceTone(row.status)}>{row.status}</Badge>
                    </Td>
                    <Td>
                      <Link
                        className="font-semibold text-deep hover:underline"
                        href={`/leave-requests/${row.id}`}
                      >
                        {row.status === 'pending' ? 'Review' : 'View & print'}
                      </Link>
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
