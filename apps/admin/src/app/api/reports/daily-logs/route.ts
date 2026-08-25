import { type NextRequest } from 'next/server';
import { requireStaff, isElevated } from '@/lib/auth';
import { fetchLogs, parseLogFilters } from '@/lib/logs-query';
import { mapsLink, yesNo } from '@/lib/format';
import { lagosDateTime, weeklyOffDayName } from '@fazoo/config';
import { serviceSupabase } from '@fazoo/database';
import {
  CSV_EXPORT_MAX_ROWS,
  RATE_LIMIT_EXPORT_MAX,
  RATE_LIMIT_EXPORT_WINDOW_S,
} from '@fazoo/config';

const COLUMNS = [
  'Attendance date',
  'BA ID',
  'BA name',
  'BA phone',
  'Campaign',
  'Store ID',
  'Store name',
  'Weekly off-day',
  'Attendance status',
  'Check-in time (Africa/Lagos)',
  'Checkout time (Africa/Lagos)',
  'Checked out',
  'Completion status',
  'SKU summary',
  'Total units',
  'Check-in latitude',
  'Check-in longitude',
  'Check-in Google Maps link',
  'Checkout latitude',
  'Checkout longitude',
  'Checkout Google Maps link',
  'Check-in distance from store (m)',
  'Checkout distance from store (m)',
  'Notes',
  'Stock photograph reference',
  'Uniform selfie reference',
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
  const photosByLog = new Map<string, { stock: string; selfie: string }>();
  const offDayByBa = new Map<string, number>();
  const coordById = new Map<
    string,
    {
      checkin_latitude: number | null;
      checkin_longitude: number | null;
      checkout_latitude: number | null;
      checkout_longitude: number | null;
      checkin_distance_metres: number | null;
      checkout_distance_metres: number | null;
      notes: string | null;
    }
  >();

  if (logIds.length > 0) {
    const [entries, photos, assignments, coords] = await Promise.all([
      client
        .from('sales_entries')
        .select('daily_log_id, quantity, skus ( code )')
        .in('daily_log_id', logIds),
      client
        .from('daily_log_photos')
        .select('daily_log_id, photo_type, storage_path')
        .in('daily_log_id', logIds),
      client
        .from('brand_ambassador_assignments')
        .select('brand_ambassador_id, weekly_off_day')
        .eq('status', 'active')
        .in(
          'brand_ambassador_id',
          [...new Set(rows.map((r) => r.ba_id))],
        ),
      client
        .from('daily_logs')
        .select(
          'id, checkin_latitude, checkin_longitude, checkout_latitude, checkout_longitude, checkin_distance_metres, checkout_distance_metres, notes',
        )
        .in('id', logIds),
    ]);

    for (const e of entries.data ?? []) {
      const code = (e.skus as unknown as { code: string } | null)?.code ?? 'unknown';
      skuByLog.set(
        e.daily_log_id,
        [skuByLog.get(e.daily_log_id), `${code}×${e.quantity}`].filter(Boolean).join(', '),
      );
    }
    for (const p of photos.data ?? []) {
      const slot = photosByLog.get(p.daily_log_id) ?? { stock: '', selfie: '' };
      if (p.photo_type === 'stock_shelf') slot.stock = p.storage_path;
      if (p.photo_type === 'uniform_selfie') slot.selfie = p.storage_path;
      photosByLog.set(p.daily_log_id, slot);
    }
    for (const a of assignments.data ?? []) offDayByBa.set(a.brand_ambassador_id, a.weekly_off_day);
    for (const c of coords.data ?? []) coordById.set(c.id, c);
  }

  // Serialize ---------------------------------------------------------------
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [
    encoder.encode('\uFEFF' + COLUMNS.map(csvEscape).join(',') + '\r\n'),
  ];
  for (const r of rows) {
    const c = coordById.get(r.id);
    const photos = photosByLog.get(r.id) ?? { stock: '', selfie: '' };
    chunks.push(
      encoder.encode(
        [
          r.attendance_date,
          r.ba_id,
          r.ba_name,
          r.ba_phone,
          r.campaign_name,
          r.store_id,
          r.store_name,
          offDayByBa.has(r.ba_id)
            ? weeklyOffDayName(offDayByBa.get(r.ba_id) as number)
            : '',
          r.attendance_status,
          r.checkin_at ? lagosDateTime(r.checkin_at) : '',
          r.checkout_at ? lagosDateTime(r.checkout_at) : '',
          yesNo(Boolean(r.checkout_at)),
          r.status,
          skuByLog.get(r.id) ?? '',
          r.units_sold,
          c?.checkin_latitude ?? '',
          c?.checkin_longitude ?? '',
          mapsLink(c?.checkin_latitude ?? null, c?.checkin_longitude ?? null) ?? '',
          c?.checkout_latitude ?? '',
          c?.checkout_longitude ?? '',
          mapsLink(c?.checkout_latitude ?? null, c?.checkout_longitude ?? null) ?? '',
          c?.checkin_distance_metres ?? '',
          c?.checkout_distance_metres ?? '',
          c?.notes ?? '',
          photos.stock,
          photos.selfie,
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
