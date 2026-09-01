import { requireStaff, isElevated } from '@/lib/auth';
import { mapsLink } from '@/lib/format';
import { formatNairobiDisplay } from '@fazoo/config';
import { serviceSupabase } from '@fazoo/database';
import {
  CSV_EXPORT_MAX_ROWS,
  RATE_LIMIT_EXPORT_MAX,
  RATE_LIMIT_EXPORT_WINDOW_S,
} from '@fazoo/config';

const COLUMNS = [
  'Session date',
  'BA ID',
  'BA name',
  'BA phone',
  'School ID',
  'School name',
  'School region',
  'Status',
  'Learners',
  'Check-in time (Africa/Nairobi)',
  'Checkout time (Africa/Nairobi)',
  'Check-in distance from school (m)',
  'Check-in Google Maps link',
  'Units distributed',
  'Distribution summary',
  'Site selfie reference',
  'Stamped document reference',
  'Notes',
] as const;

function csvEscape(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

interface CsvRow {
  id: string;
  session_date: string;
  status: string;
  learner_count: number;
  checkin_at: string | null;
  checkout_at: string | null;
  checkin_latitude: number | null;
  checkin_longitude: number | null;
  checkin_distance_metres: number | null;
  notes: string | null;
  profiles: { id: string; full_name: string; phone: string } | null;
  veda_schools: { id: string; name: string; region: string | null } | null;
}

export async function GET() {
  // 1) Authorization: approved elevated staff only (org-scoped via RLS client).
  const { client, profile } = await requireStaff();
  if (!isElevated(profile.role)) {
    return new Response('Forbidden', { status: 403 });
  }

  // 2) Rate limit (fixed-window counter in Postgres, keyed per user).
  try {
    const limiter = serviceSupabase();
    const { data: allowed } = await limiter.rpc('check_rate_limit', {
      p_key: `csv-export:veda:${profile.id}`,
      p_max: RATE_LIMIT_EXPORT_MAX,
      p_window_seconds: RATE_LIMIT_EXPORT_WINDOW_S,
    });
    if (allowed === false) {
      return new Response('Too many exports — please wait a few minutes.', {
        status: 429,
      });
    }
  } catch {
    // Limiter unavailable (e.g. local dev without service key): continue.
  }

  const { data: raw } = await client
    .from('veda_sessions')
    .select(
      `id, session_date, status, learner_count, checkin_at, checkout_at,
       checkin_latitude, checkin_longitude, checkin_distance_metres, notes,
       profiles!veda_sessions_brand_ambassador_id_fkey ( id, full_name, phone ),
       veda_schools!veda_sessions_school_id_fkey ( id, name, region )`,
    )
    .order('session_date', { ascending: false })
    .limit(Math.min(5000, CSV_EXPORT_MAX_ROWS));

  const rows = (raw ?? []) as unknown as CsvRow[];
  const sessionIds = rows.map((r) => r.id);

  const [distributions, photos] =
    sessionIds.length > 0
      ? await Promise.all([
          client
            .from('veda_session_distributions')
            .select(
              'session_id, quantity, stationery_item:veda_stationery_items!veda_session_distributions_stationery_item_id_fkey ( code, name )',
            )
            .in('session_id', sessionIds),
          client
            .from('veda_session_photos')
            .select('session_id, photo_type, storage_path')
            .in('session_id', sessionIds),
        ])
      : [{ data: null }, { data: null }];

  const summaryBySession = new Map<string, string>();
  for (const d of distributions.data ?? []) {
    const item = d.stationery_item as unknown as { name: string; code: string | null } | null;
    const label = item?.name ?? item?.code ?? 'unknown';
    summaryBySession.set(
      d.session_id,
      [summaryBySession.get(d.session_id), `${label}×${d.quantity}`].filter(Boolean).join('; '),
    );
  }
  const selfieBySession = new Map<string, string>();
  const docBySession = new Map<string, string>();
  for (const p of photos.data ?? []) {
    if (p.photo_type === 'site_selfie') selfieBySession.set(p.session_id, p.storage_path);
    if (p.photo_type === 'stamped_document') docBySession.set(p.session_id, p.storage_path);
  }

  // Serialize ---------------------------------------------------------------
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [
    encoder.encode('\uFEFF' + COLUMNS.map(csvEscape).join(',') + '\r\n'),
  ];
  for (const r of rows) {
    const units = summaryBySession.get(r.id) ?? '';
    const unitCount = units ? units.split('; ').reduce((s, part) => s + Number(part.split('×')[1] ?? 0), 0) : 0;
    chunks.push(
      encoder.encode(
        [
          r.session_date,
          r.profiles?.id ?? '',
          r.profiles?.full_name ?? '',
          r.profiles?.phone ?? '',
          r.veda_schools?.id ?? '',
          r.veda_schools?.name ?? '',
          r.veda_schools?.region ?? '',
          r.status,
          r.learner_count,
          r.checkin_at ? formatNairobiDisplay(r.checkin_at) : '',
          r.checkout_at ? formatNairobiDisplay(r.checkout_at) : '',
          r.checkin_distance_metres ?? '',
          mapsLink(r.checkin_latitude, r.checkin_longitude) ?? '',
          unitCount,
          units,
          selfieBySession.get(r.id) ?? '',
          docBySession.get(r.id) ?? '',
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
      'Content-Disposition': `attachment; filename="fazoo-veda-activations-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}