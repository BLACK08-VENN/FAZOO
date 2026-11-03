import Link from 'next/link';
import { lagosDateTime } from '@fazoo/config';
import type { ActivityLog } from '@/server/brand-analytics';
import { Badge, attendanceTone, completionBadge } from '@/components/ui/badge';
import { EmptyRow, Table, TableWrap, Td, Th } from '@/components/ui/table';

function time(value: string | null): string {
  if (!value) return '—';
  try {
    return lagosDateTime(value).slice(11, 16);
  } catch {
    return '—';
  }
}

export function ActivityTable({
  logs,
  linkStores = true,
  linkCampaigns = true,
  empty = 'No activity recorded yet.',
}: {
  logs: ActivityLog[];
  linkStores?: boolean;
  linkCampaigns?: boolean;
  empty?: string;
}) {
  const columns = linkCampaigns ? 7 : 6;
  return (
    <TableWrap>
      <Table>
        <thead>
          <tr>
            <Th>Date</Th>
            <Th className="hidden md:table-cell">Store</Th>
            <Th className="hidden lg:table-cell">Campaign</Th>
            <Th>Attendance</Th>
            <Th>Report</Th>
            <Th className="hidden sm:table-cell">In / out</Th>
            <Th className="text-right">Units</Th>
          </tr>
        </thead>
        <tbody>
          {logs.length === 0 ? (
            <EmptyRow colSpan={columns}>{empty}</EmptyRow>
          ) : (
            logs.map((log) => (
              <tr key={log.id} className="hover:bg-lavender/40">
                <Td className="whitespace-nowrap text-xs tabular-nums">{log.attendance_date}</Td>
                <Td className="hidden md:table-cell">
                  {linkStores ? (
                    <Link
                      href={`/brand/stores/${log.store_id}`}
                      className="text-deep underline underline-offset-2"
                    >
                      {log.store_name}
                    </Link>
                  ) : (
                    log.store_name
                  )}
                </Td>
                <Td className="hidden text-xs text-muted lg:table-cell">
                  {linkCampaigns ? (
                    <Link
                      href={`/brand/campaigns/${log.campaign_id}`}
                      className="text-deep underline underline-offset-2"
                    >
                      {log.campaign_name}
                    </Link>
                  ) : (
                    log.campaign_name
                  )}
                </Td>
                <Td>
                  <Badge tone={attendanceTone(log.attendance_status)}>
                    {log.attendance_status.replace('_', ' ')}
                  </Badge>
                </Td>
                <Td>
                  <span className="inline-flex flex-wrap items-center gap-1">
                    {completionBadge(log.status)}
                    {log.flagged ? <Badge tone="danger">flagged</Badge> : null}
                  </span>
                </Td>
                <Td className="hidden whitespace-nowrap text-xs tabular-nums text-muted sm:table-cell">
                  {time(log.checkin_at)} → {time(log.checkout_at)}
                </Td>
                <Td className="text-right font-medium tabular-nums">{log.units}</Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
    </TableWrap>
  );
}
