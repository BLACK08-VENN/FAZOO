import { requireStaff } from '@/lib/auth';
import { fetchLogs, parseLogFilters } from '@/lib/logs-query';
import { LogFiltersForm } from '@/components/filters';
import { PageHeader } from '@/components/page';
import { Card } from '@/components/ui/card';
import { EmptyRow, Table, TableWrap, Td, Th } from '@/components/ui/table';
import { lagosDateTime } from '@fazoo/config';

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { client } = await requireStaff();
  const params = await searchParams;
  const filters = parseLogFilters(params);
  const rows = await fetchLogs(client, filters);

  return (
    <>
      <PageHeader
        title="Reports"
        description="CSV downloads respect every active filter and use Nigerian times."
      />

      <Card className="mb-6 p-4">
        <LogFiltersForm
          action="/reports"
          campaigns={[]}
          bas={[]}
          stores={[]}
          current={Object.fromEntries(Object.entries(filters).map(([k, v]) => [k, v as string]))}
        />
        <div className="mt-4">
          <a
            href={`/api/reports/daily-logs?${new URLSearchParams(
              Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][],
            )}`}
            className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-deep"
            download
          >
            Download CSV ({rows.length} rows)
          </a>
        </div>
      </Card>

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Date</Th><Th>BA name</Th><Th>Store name</Th>
              <Th>Check-in</Th><Th>Checkout</Th><Th>Status</Th>
              <Th className="text-right">Units</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={7}>Nothing to report for these filters.</EmptyRow>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <Td>{r.attendance_date}</Td>
                  <Td className="font-medium">{r.ba_name}</Td>
                  <Td>{r.store_name}</Td>
                  <Td>{r.checkin_at ? lagosDateTime(r.checkin_at) : '—'}</Td>
                  <Td>{r.checkout_at ? lagosDateTime(r.checkout_at) : '—'}</Td>
                  <Td>{r.status}{r.flagged ? ' · flagged' : ''}</Td>
                  <Td className="text-right tabular-nums">{r.units_sold}</Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </TableWrap>

      <p className="mt-3 text-xs text-muted">
        Photograph references are private storage paths. Short-lived signed URLs
        can be enabled via ADMIN_SIGNED_PHOTO_URLS but are omitted by default.
      </p>
    </>
  );
}
