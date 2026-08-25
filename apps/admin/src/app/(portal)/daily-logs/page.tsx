import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import { fetchLogs, parseLogFilters } from '@/lib/logs-query';
import { LogFiltersForm } from '@/components/filters';
import { PageHeader } from '@/components/page';
import { Badge, attendanceTone, completionBadge } from '@/components/ui/badge';
import { EmptyRow, Table, TableWrap, Td, Th } from '@/components/ui/table';
import { formatLagosDisplay, weeklyOffDayName } from '@fazoo/config';

export default async function DailyLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { client } = await requireStaff();
  const params = await searchParams;
  const filters = parseLogFilters(params);

  const [rows, options] = await Promise.all([
    fetchLogs(client, filters),
    Promise.all([
      client.from('campaigns').select('id, name').order('name'),
      client.from('profiles').select('id, full_name').eq('role', 'brand_ambassador').order('full_name'),
      client.from('stores').select('id, name').order('name'),
    ]),
  ]);

  const [campaigns, bas, stores] = options;

  return (
    <>
      <PageHeader
        title="Daily Logs"
        description="Every check-in, checkout and attendance record in Nigerian time."
      />

      <div className="mb-6 rounded-xl border border-ink/8 bg-white p-4">
        <LogFiltersForm
          action="/daily-logs"
          campaigns={(campaigns.data ?? []).map((c) => ({ id: c.id, label: c.name }))}
          bas={(bas.data ?? []).map((b) => ({ id: b.id, label: b.full_name }))}
          stores={(stores.data ?? []).map((s) => ({ id: s.id, label: s.name }))}
          current={Object.fromEntries(Object.entries(filters).map(([k, v]) => [k, v as string]))}
        />
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
          <span>
            Completion:{' '}
            <a className="underline" href={`/daily-logs?completion_status=open`}>open only</a>
            {' · '}
            <a className="underline" href={`/daily-logs?completion_status=completed`}>completed only</a>
          </span>
          <span>
            <Link className="underline" href={`/reports?${new URLSearchParams(
              Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][],
            )}`}>
              Open in Reports
            </Link>
          </span>
        </div>
      </div>

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>BA</Th>
              <Th>BA ID</Th>
              <Th>Store</Th>
              <Th>Check-in</Th>
              <Th>Checkout</Th>
              <Th>Attendance</Th>
              <Th>Completion</Th>
              <Th className="text-right">Units</Th>
              <Th className="text-right">Photos</Th>
              <Th>Flags</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={11}>No logs match these filters.</EmptyRow>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="hover:bg-lavender/60">
                  <Td>{r.attendance_date}</Td>
                  <Td className="font-medium">
                    <Link className="text-deep underline-offset-2 hover:underline" href={`/brand-ambassadors/${r.ba_id}`}>
                      {r.ba_name}
                    </Link>
                  </Td>
                  <Td className="font-mono text-xs">{r.ba_id.slice(0, 8)}</Td>
                  <Td>{r.store_name}</Td>
                  <Td>{r.checkin_at ? formatLagosDisplay(r.checkin_at).split(', ').pop() : '—'}</Td>
                  <Td>{r.checkout_at ? formatLagosDisplay(r.checkout_at).split(', ').pop() : '—'}</Td>
                  <Td><Badge tone={attendanceTone(r.attendance_status)}>{r.attendance_status.replace('_', ' ')}</Badge></Td>
                  <Td>{completionBadge(r.status)}</Td>
                  <Td className="text-right tabular-nums">{r.units_sold}</Td>
                  <Td className="text-right tabular-nums">{r.photo_count}</Td>
                  <Td>
                    {r.flagged ? <Badge tone="warning">Flagged</Badge> : null}
                    {r.attendance_status === 'weekly_off' ? (
                      <Badge tone="purple">{weeklyOffDayName(new Date(`${r.attendance_date}T00:00:00Z`).getUTCDay())} off</Badge>
                    ) : null}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </TableWrap>
      <p className="mt-3 text-xs text-muted">Showing up to 500 records for the selected range.</p>
    </>
  );
}
