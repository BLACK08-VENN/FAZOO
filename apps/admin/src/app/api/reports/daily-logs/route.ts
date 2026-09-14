import { type NextRequest } from 'next/server';
import { requireStaff, isElevated } from '@/lib/auth';
import { fetchLogs, parseLogFilters } from '@/lib/logs-query';
import { lagosDateTime } from '@fazoo/config';
import { serviceSupabase } from '@fazoo/database';
import {
  CSV_EXPORT_MAX_ROWS,
  RATE_LIMIT_EXPORT_MAX,
  RATE_LIMIT_EXPORT_WINDOW_S,
} from '@fazoo/config';

const COLUMNS = [
  'Attendance date',
  'BA name',
  'Campaign',
  'Store name',
  'Attendance status',
  'Check-in time (Africa/Lagos)',
  'Checkout time (Africa/Lagos)',
  'Completion status',
  'SKU summary',
  'Total units',
  'Notes',
] as const;

function csvEscape(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

export async function GET(request: NextRequest) {
  // 1) Authorization: approved elevated staff; supervisors export their scope.
  const { client, profile } = await requireStaff();
  if (!isElevated(profile.role)) {
    return new Response('Forbidden', { status: 403 });
  }

  // 2) Rate limit (fixed-window counter in Postgres, keyed per user).
  try {
    const limiter = serviceSupabase();
    const { data: allowed } = await limiter.rpc('check_rate_limit', {
      p_key: `csv-export:${profile.id}`,
      p_max: RATE_LIMIT_EXPORT_MAX,
      p_window_seconds: RATE_LIMIT_EXPORT_WINDOW_S,
    });
    if (allowed === false) {
      return new Response('Too many exports — please wait a few minutes.', {
        status: 429,
      });
    }
  } catch {
    // Limiter unavailable (e.g. local dev without service key): continue;
    // platform-level limits still apply.
  }

  const params = request.nextUrl.searchParams;
  const filters = parseLogFilters(params);
  const rows = await fetchLogs(client, filters, Math.min(5000, CSV_EXPORT_MAX_ROWS));
  const logIds = rows.map((r) => r.id);

  // Enrichments ------------------------------------------------------------
  const skuByLog = new Map<string, string>();

  if (logIds.length > 0) {
    const { data: entries } = await client
      .from('sales_entries')
      .select('daily_log_id, quantity, skus ( code )')
      .in('daily_log_id', logIds);

    for (const e of entries ?? []) {
      const code = (e.skus as unknown as { code: string } | null)?.code ?? 'unknown';
      skuByLog.set(
        e.daily_log_id,
        [skuByLog.get(e.daily_log_id), `${code}×${e.quantity}`].filter(Boolean).join(', '),
      );
    }
  }

  // Serialize ---------------------------------------------------------------
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [
    encoder.encode('\uFEFF' + COLUMNS.map(csvEscape).join(',') + '\r\n'),
  ];
  for (const r of rows) {
    chunks.push(
      encoder.encode(
        [
          r.attendance_date,
          r.ba_name,
          r.campaign_name,
          r.store_name,
          r.attendance_status,
          r.checkin_at ? lagosDateTime(r.checkin_at) : '',
          r.checkout_at ? lagosDateTime(r.checkout_at) : '',
          r.status,
          skuByLog.get(r.id) ?? '',
          r.units_sold,
          r.notes ?? '',
        ]
          .map(csvEscape)
          .join(',') + '\r\n',
      ),
    );
  }

  const totalBytes = chunks.reduce((s, c) => s + c.byteLength, 0);
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 17);

  return new Response(chunks[0] ? Buffer.concat(chunks, totalBytes) : Buffer.alloc(0), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="fazoo-daily-logs-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
