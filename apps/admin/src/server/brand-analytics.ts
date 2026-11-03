import 'server-only';
import { lagosDate } from '@fazoo/config';
import type { FazooClient } from '@fazoo/database';

export type BrandCampaign = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  start_date: string;
  end_date: string | null;
  review_note?: string | null;
  reviewed_at?: string | null;
};

export type BrandBa = {
  id: string;
  full_name: string;
  phone: string | null;
  profile_photo_path: string | null;
};

export type BrandStore = {
  id: string;
  name: string;
  address: string | null;
  status: string;
};

export type BrandSkuUnits = {
  name: string;
  quantity: number;
};

export type BrandLog = {
  id: string;
  campaign_id: string;
  campaign_name: string;
  ba_id: string;
  ba_name: string;
  store_id: string;
  store_name: string;
  attendance_date: string;
  attendance_status: string;
  status: string;
  flagged: boolean;
  checkin_at: string | null;
  checkout_at: string | null;
  units: number;
  skus: BrandSkuUnits[];
};

export type ActivityLog = Omit<BrandLog, 'ba_id' | 'ba_name'>;

/** Strips field-worker identifiers before logs cross into a client component. */
export function toActivityLogs(logs: BrandLog[]): ActivityLog[] {
  return logs.map((log) => ({
    id: log.id,
    campaign_id: log.campaign_id,
    campaign_name: log.campaign_name,
    store_id: log.store_id,
    store_name: log.store_name,
    attendance_date: log.attendance_date,
    attendance_status: log.attendance_status,
    status: log.status,
    flagged: log.flagged,
    checkin_at: log.checkin_at,
    checkout_at: log.checkout_at,
    units: log.units,
    skus: log.skus,
  }));
}

export type LogFilters = {
  campaignId?: string;
  baId?: string;
  storeId?: string;
  from?: string;
  to?: string;
  limit?: number;
};

const LOG_SELECT = `
  id, campaign_id, brand_ambassador_id, store_id, attendance_date,
  attendance_status, status, flagged, checkin_at, checkout_at,
  stores!daily_logs_store_id_fkey ( id, name ),
  campaigns!daily_logs_campaign_id_fkey ( name ),
  sales_entries ( quantity, skus ( name ) )
`;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function safeDate(value: string | undefined): string | null {
  return value && DATE_PATTERN.test(value) ? value : null;
}

function dayIndex(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}

function mapLog(row: Record<string, unknown>): BrandLog {
  const store = row.stores as { id?: string; name?: string } | null;
  const campaign = row.campaigns as { name?: string } | null;
  const entries =
    (row.sales_entries as
      | Array<{ quantity: number; skus: { name: string } | null }>
      | null) ?? [];

  return {
    id: row.id as string,
    campaign_id: row.campaign_id as string,
    campaign_name: campaign?.name ?? 'Unknown campaign',
    ba_id: row.brand_ambassador_id as string,
    ba_name: 'Field member',
    store_id: row.store_id as string,
    store_name: store?.name ?? 'Unknown store',
    attendance_date: row.attendance_date as string,
    attendance_status: row.attendance_status as string,
    status: row.status as string,
    flagged: Boolean(row.flagged),
    checkin_at: (row.checkin_at as string | null) ?? null,
    checkout_at: (row.checkout_at as string | null) ?? null,
    units: entries.reduce((sum, entry) => sum + entry.quantity, 0),
    skus: entries.map((entry) => ({
      name: entry.skus?.name ?? 'Unknown SKU',
      quantity: entry.quantity,
    })),
  };
}

export async function loadBrandCampaigns(client: FazooClient): Promise<BrandCampaign[]> {
  const { data, error } = await client
    .from('campaigns')
    .select('id, name, description, status, start_date, end_date, review_note, reviewed_at')
    .order('start_date', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as BrandCampaign[];
}

export async function loadBrandCampaign(
  client: FazooClient,
  id: string,
): Promise<BrandCampaign | null> {
  const { data, error } = await client
    .from('campaigns')
    .select('id, name, description, status, start_date, end_date, review_note, reviewed_at')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as BrandCampaign | null) ?? null;
}

export async function loadBrandStores(client: FazooClient): Promise<BrandStore[]> {
  const { data, error } = await client
    .from('stores')
    .select('id, name, address, status')
    .order('name');

  if (error) throw new Error(error.message);
  return (data ?? []) as BrandStore[];
}

export async function loadBrandStore(
  client: FazooClient,
  id: string,
): Promise<BrandStore | null> {
  const { data, error } = await client
    .from('stores')
    .select('id, name, address, status')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as BrandStore | null) ?? null;
}

export async function loadBrandBas(client: FazooClient): Promise<BrandBa[]> {
  const { data, error } = await client
    .from('profiles')
    .select('id, full_name, phone, profile_photo_path')
    .eq('role', 'brand_ambassador')
    .eq('account_status', 'approved')
    .order('full_name');

  if (error) throw new Error(error.message);
  return (data ?? []) as BrandBa[];
}

export async function loadBrandBa(
  client: FazooClient,
  id: string,
): Promise<BrandBa | null> {
  const { data, error } = await client
    .from('profiles')
    .select('id, full_name, phone, profile_photo_path')
    .eq('id', id)
    .eq('role', 'brand_ambassador')
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as BrandBa | null) ?? null;
}

export async function loadBrandLogs(
  client: FazooClient,
  filters: LogFilters = {},
): Promise<BrandLog[]> {
  let query = client.from('daily_logs').select(LOG_SELECT);

  if (filters.campaignId) query = query.eq('campaign_id', filters.campaignId);
  if (filters.baId) query = query.eq('brand_ambassador_id', filters.baId);
  if (filters.storeId) query = query.eq('store_id', filters.storeId);

  const from = safeDate(filters.from);
  const to = safeDate(filters.to);
  if (from) query = query.gte('attendance_date', from);
  if (to) query = query.lte('attendance_date', to);

  const { data, error } = await query
    .order('attendance_date', { ascending: false })
    .order('checkin_at', { ascending: false, nullsFirst: false })
    .limit(filters.limit ?? 5000);

  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map(mapLog);
}

export type LogSummary = {
  logs: number;
  completed: number;
  open: number;
  present: number;
  sickLeave: number;
  absent: number;
  weeklyOff: number;
  flagged: number;
  units: number;
  completionRate: number;
  attendanceRate: number;
};

export function summarizeLogs(logs: BrandLog[]): LogSummary {
  const present = logs.filter((log) => log.attendance_status === 'present').length;
  const sickLeave = logs.filter((log) => log.attendance_status === 'sick_leave').length;
  const absent = logs.filter((log) => log.attendance_status === 'absent').length;
  const weeklyOff = logs.filter((log) => log.attendance_status === 'weekly_off').length;
  const completed = logs.filter((log) => log.status === 'completed').length;
  const open = logs.filter((log) => log.status === 'open').length;
  const accountable = present + sickLeave + absent;

  return {
    logs: logs.length,
    completed,
    open,
    present,
    sickLeave,
    absent,
    weeklyOff,
    flagged: logs.filter((log) => log.flagged).length,
    units: logs.reduce((sum, log) => sum + log.units, 0),
    completionRate: logs.length === 0 ? 0 : Math.round((completed / logs.length) * 100),
    attendanceRate: accountable === 0 ? 0 : Math.round((present / accountable) * 100),
  };
}

export type TrendSeriesPoint = {
  day: string;
  units: number;
  completionPct: number;
};

export function trendFromLogs(logs: BrandLog[]): TrendSeriesPoint[] {
  const byDay = new Map<string, { units: number; total: number; completed: number }>();

  for (const log of logs) {
    const day = byDay.get(log.attendance_date) ?? { units: 0, total: 0, completed: 0 };
    day.units += log.units;
    day.total += 1;
    if (log.status === 'completed') day.completed += 1;
    byDay.set(log.attendance_date, day);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, value]) => ({
      day,
      units: value.units,
      completionPct: value.total === 0 ? 0 : Math.round((value.completed / value.total) * 100),
    }));
}

export type AttendanceMix = {
  present: number;
  sickLeave: number;
  absent: number;
  weeklyOff: number;
  total: number;
  presentPct: number;
  sickLeavePct: number;
  absentPct: number;
  weeklyOffPct: number;
};

export function attendanceMix(logs: BrandLog[]): AttendanceMix {
  const total = logs.length;
  const pct = (value: number) => (total === 0 ? 0 : Math.round((value / total) * 100));
  const present = logs.filter((log) => log.attendance_status === 'present').length;
  const sickLeave = logs.filter((log) => log.attendance_status === 'sick_leave').length;
  const absent = logs.filter((log) => log.attendance_status === 'absent').length;
  const weeklyOff = logs.filter((log) => log.attendance_status === 'weekly_off').length;

  return {
    present,
    sickLeave,
    absent,
    weeklyOff,
    total,
    presentPct: pct(present),
    sickLeavePct: pct(sickLeave),
    absentPct: pct(absent),
    weeklyOffPct: pct(weeklyOff),
  };
}

export type WeekdayPoint = { day: string; visits: number; units: number };

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function weekdayActivity(logs: BrandLog[]): WeekdayPoint[] {
  const buckets = WEEKDAY_LABELS.map((day) => ({ day, visits: 0, units: 0 }));
  for (const log of logs) {
    const index = (new Date(`${log.attendance_date}T00:00:00Z`).getUTCDay() + 6) % 7;
    const bucket = buckets[index];
    if (!bucket) continue;
    if (log.attendance_status === 'present') bucket.visits += 1;
    bucket.units += log.units;
  }
  return buckets;
}

export type StoreActivity = { id: string; name: string; visits: number; units: number };

export function storeActivity(logs: BrandLog[]): StoreActivity[] {
  const byStore = new Map<string, StoreActivity>();
  for (const log of logs) {
    const entry = byStore.get(log.store_id) ?? {
      id: log.store_id,
      name: log.store_name,
      visits: 0,
      units: 0,
    };
    if (log.attendance_status === 'present') entry.visits += 1;
    entry.units += log.units;
    byStore.set(log.store_id, entry);
  }
  return [...byStore.values()].sort(
    (a, b) => b.visits - a.visits || b.units - a.units || a.name.localeCompare(b.name),
  );
}

export function skuBreakdown(logs: BrandLog[]): BrandSkuUnits[] {
  const totals = new Map<string, number>();

  for (const log of logs) {
    for (const sku of log.skus) {
      totals.set(sku.name, (totals.get(sku.name) ?? 0) + sku.quantity);
    }
  }

  return [...totals.entries()]
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));
}

export type CampaignTimeline = {
  phase: 'upcoming' | 'live' | 'ended';
  totalDays: number | null;
  daysLeft: number | null;
  elapsedPct: number;
};

export function campaignTimeline(
  campaign: BrandCampaign,
  today = lagosDate(),
): CampaignTimeline {
  const start = dayIndex(campaign.start_date);
  const now = dayIndex(today);
  const end = campaign.end_date ? dayIndex(campaign.end_date) : null;

  if (now < start) {
    return {
      phase: 'upcoming',
      totalDays: end === null ? null : end - start + 1,
      daysLeft: start - now,
      elapsedPct: 0,
    };
  }

  if (end === null) {
    return {
      phase: 'live',
      totalDays: null,
      daysLeft: null,
      elapsedPct: 0,
    };
  }

  const totalDays = Math.max(1, end - start + 1);

  if (now > end) {
    return { phase: 'ended', totalDays, daysLeft: 0, elapsedPct: 100 };
  }

  const elapsedDays = Math.min(totalDays, Math.max(0, now - start + 1));

  return {
    phase: 'live',
    totalDays,
    daysLeft: end - now,
    elapsedPct: Math.round((elapsedDays / totalDays) * 100),
  };
}

function groupBy(logs: BrandLog[], key: (log: BrandLog) => string): Map<string, BrandLog[]> {
  const groups = new Map<string, BrandLog[]>();
  for (const log of logs) {
    const id = key(log);
    const group = groups.get(id);
    if (group) {
      group.push(log);
    } else {
      groups.set(id, [log]);
    }
  }
  return groups;
}

function latestDate(logs: BrandLog[]): string | null {
  return logs.reduce<string | null>(
    (latest, log) => (latest === null || log.attendance_date > latest ? log.attendance_date : latest),
    null,
  );
}

export type CampaignPerformance = LogSummary & {
  campaign: BrandCampaign;
  bas: number;
  stores: number;
  lastActive: string | null;
  timeline: CampaignTimeline;
};

export function campaignPerformance(
  campaigns: BrandCampaign[],
  logs: BrandLog[],
): CampaignPerformance[] {
  const grouped = groupBy(logs, (log) => log.campaign_id);

  return campaigns.map((campaign) => {
    const campaignLogs = grouped.get(campaign.id) ?? [];
    const summary = summarizeLogs(campaignLogs);
    return {
      campaign,
      ...summary,
      bas: new Set(campaignLogs.map((log) => log.ba_id)).size,
      stores: new Set(
        campaignLogs
          .filter((log) => log.attendance_status === 'present')
          .map((log) => log.store_id),
      ).size,
      lastActive: latestDate(campaignLogs),
      timeline: campaignTimeline(campaign),
    };
  });
}

export type BaPerformance = LogSummary & {
  ba: BrandBa;
  stores: number;
  campaigns: number;
  campaignNames: string[];
  lastActive: string | null;
};

export function baPerformance(bas: BrandBa[], logs: BrandLog[]): BaPerformance[] {
  const grouped = groupBy(logs, (log) => log.ba_id);
  const known = new Map<string, BrandBa>(bas.map((ba) => [ba.id, ba]));

  for (const [id, group] of grouped) {
    if (!known.has(id)) {
      known.set(id, {
        id,
        full_name: group[0]?.ba_name ?? 'Unknown brand ambassador',
        phone: null,
        profile_photo_path: null,
      });
    }
  }

  return [...known.values()]
    .map((ba) => {
      const baLogs = grouped.get(ba.id) ?? [];
      const summary = summarizeLogs(baLogs);
      const campaignNames = [...new Set(baLogs.map((log) => log.campaign_name))].sort();
      return {
        ba,
        ...summary,
        stores: new Set(
          baLogs
            .filter((log) => log.attendance_status === 'present')
            .map((log) => log.store_id),
        ).size,
        campaigns: campaignNames.length,
        campaignNames,
        lastActive: latestDate(baLogs),
      };
    })
    .sort((a, b) => b.units - a.units || a.ba.full_name.localeCompare(b.ba.full_name));
}

export type StorePerformance = LogSummary & {
  store: BrandStore;
  bas: number;
  lastVisit: string | null;
};

export function storePerformance(
  stores: BrandStore[],
  logs: BrandLog[],
): StorePerformance[] {
  const grouped = groupBy(logs, (log) => log.store_id);
  const known = new Map<string, BrandStore>(stores.map((store) => [store.id, store]));

  for (const [id, group] of grouped) {
    if (!known.has(id)) {
      known.set(id, {
        id,
        name: group[0]?.store_name ?? 'Unknown store',
        address: null,
        status: 'inactive',
      });
    }
  }

  return [...known.values()]
    .map((store) => {
      const storeLogs = grouped.get(store.id) ?? [];
      const summary = summarizeLogs(storeLogs);
      return {
        store,
        ...summary,
        bas: new Set(storeLogs.map((log) => log.ba_id)).size,
        lastVisit: latestDate(
          storeLogs.filter((log) => log.attendance_status === 'present'),
        ),
      };
    })
    .sort(
      (a, b) =>
        b.present - a.present ||
        b.units - a.units ||
        a.store.name.localeCompare(b.store.name),
    );
}
