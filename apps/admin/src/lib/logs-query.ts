import { lagosDate } from '@fazoo/config';
import { logFiltersSchema, type LogFilters } from '@fazoo/validation';
import type { FazooClient } from '@fazoo/database';

export function resolveRange(filters: LogFilters): { from: string; to: string } {
  const today = lagosDate();
  if (filters.preset !== 'custom' && !filters.from && !filters.to) {
    const days = filters.preset === '7d' ? 7 : filters.preset === '30d' ? 30 : 90;
    const from = new Date(Date.parse(`${today}T00:00:00Z`) - (days - 1) * 86_400_000);
    return { from: from.toISOString().slice(0, 10), to: today };
  }
  return {
    from: filters.from ?? filters.to ?? today,
    to: filters.to ?? filters.from ?? today,
  };
}

export function parseLogFilters(params: URLSearchParams | Record<string, string | undefined>): LogFilters {
  const raw =
    params instanceof URLSearchParams
      ? Object.fromEntries(
          [...params.entries()].filter(([, v]) => v !== ''),
        )
      : params;
  const parsed = logFiltersSchema.safeParse(raw);
  return parsed.success ? parsed.data : logFiltersSchema.parse({ preset: '30d' });
}

export interface LogRow {
  id: string;
  attendance_date: string;
  attendance_status: string;
  status: string;
  flagged: boolean;
  checkin_at: string | null;
  checkout_at: string | null;
  notes: string | null;
  ba_id: string;
  ba_name: string;
  ba_phone: string;
  store_id: string;
  store_name: string;
  campaign_id: string;
  campaign_name: string;
  units_sold: number;
  photo_count: number;
}

const SELECT = `
  id, attendance_date, attendance_status, status, flagged,
  checkin_at, checkout_at, notes,
  profiles!daily_logs_brand_ambassador_id_fkey ( id, full_name, phone ),
  stores!daily_logs_store_id_fkey ( id, name ),
  campaigns!daily_logs_campaign_id_fkey ( id, name ),
  sales_entries ( quantity ),
  daily_log_photos ( count )
`;

type RawRow = {
  id: string;
  attendance_date: string;
  attendance_status: string;
  status: string;
  flagged: boolean;
  checkin_at: string | null;
  checkout_at: string | null;
  notes: string | null;
  profiles: { id: string; full_name: string; phone: string } | null;
  stores: { id: string; name: string } | null;
  campaigns: { id: string; name: string } | null;
  sales_entries: Array<{ quantity: number }> | null;
  daily_log_photos: Array<{ count: number }> | null;
};

function mapRow(r: RawRow): LogRow {
  return {
    id: r.id,
    attendance_date: r.attendance_date,
    attendance_status: r.attendance_status,
    status: r.status,
    flagged: r.flagged,
    checkin_at: r.checkin_at,
    checkout_at: r.checkout_at,
    notes: r.notes,
    ba_id: r.profiles?.id ?? '',
    ba_name: r.profiles?.full_name ?? 'Unknown',
    ba_phone: r.profiles?.phone ?? '',
    store_id: r.stores?.id ?? '',
    store_name: r.stores?.name ?? 'Unknown store',
    campaign_id: r.campaigns?.id ?? '',
    campaign_name: r.campaigns?.name ?? '',
    units_sold: (r.sales_entries ?? []).reduce((sum, e) => sum + e.quantity, 0),
    photo_count: r.daily_log_photos?.[0]?.count ?? 0,
  };
}

export async function fetchLogs(
  client: FazooClient,
  filters: LogFilters,
  limit = 500,
): Promise<LogRow[]> {
  const { from, to } = resolveRange(filters);

  let query = client
    .from('daily_logs')
    .select(SELECT)
    .gte('attendance_date', from)
    .lte('attendance_date', to)
    .order('attendance_date', { ascending: false })
    .order('checkin_at', { ascending: false })
    .limit(limit);

  if (filters.campaign_id) query = query.eq('campaign_id', filters.campaign_id);
  if (filters.ba_id) query = query.eq('brand_ambassador_id', filters.ba_id);
  if (filters.store_id) query = query.eq('store_id', filters.store_id);
  if (filters.attendance_status) query = query.eq('attendance_status', filters.attendance_status);
  if (filters.completion_status) query = query.eq('status', filters.completion_status);

  const { data, error } = await query;
  if (error) throw error;

  let rows = ((data ?? []) as unknown as RawRow[]).map(mapRow);

  // SKU-level filter requires inspecting entries.
  if (filters.sku_id) {
    const { data: entryLogs } = await client
      .from('sales_entries')
      .select('daily_log_id')
      .eq('sku_id', filters.sku_id);
    const allowed = new Set((entryLogs ?? []).map((e) => e.daily_log_id));
    rows = rows.filter((r) => allowed.has(r.id));
  }

  return rows;
}
