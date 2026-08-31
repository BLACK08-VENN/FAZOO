import {
  requireClient,
  type ClientBrand,
  type ClientProfile,
} from '@/lib/client-auth';
import type { FazooClient } from '@fazoo/database';
import { PageHeader, StatCard } from '@/components/page';
import { Card } from '@/components/ui/card';
import { TrendsChart, type TrendPoint } from '../../(portal)/overview/trends-chart';

type BaHistoryRow = {
  attendance_date: string;
  attendance_status: string;
  status: string;
  flagged: boolean;
  units: number;
  campaign_name: string;
  store_name: string;
  store_address: string | null;
};

export default async function BrandOverviewPage() {
  const { client, profile, brand } = await requireClient();

  if (profile.role === 'brand_ambassador') {
    return <BrandAmbassadorOverview brand={brand} profile={profile} />;
  }

  const { data: campaigns } = await client
    .from('campaigns')
    .select('id, name, status, start_date, end_date')
    .order('start_date', { ascending: false });

  const campaignIds = (campaigns ?? []).map((c) => c.id);

  let allLogs: Array<{
    attendance_date: string;
    attendance_status: string;
    status: string;
    units_sold: number;
    ba_id: string;
    store_id: string;
    campaign_id: string;
  }> = [];

  if (campaignIds.length > 0) {
    const { data: logs } = await client
      .from('daily_logs')
      .select(`
        attendance_date, attendance_status, status,
        brand_ambassador_id, store_id, campaign_id,
        sales_entries ( quantity )
      `)
      .in('campaign_id', campaignIds)
      .order('attendance_date', { ascending: false })
      .limit(5000);

    allLogs = (logs ?? []).map((r: Record<string, unknown>) => ({
      attendance_date: r.attendance_date as string,
      attendance_status: r.attendance_status as string,
      status: r.status as string,
      units_sold: ((r.sales_entries as Array<{ quantity: number }> | null) ?? []).reduce(
        (s, e) => s + e.quantity,
        0,
      ),
      ba_id: r.brand_ambassador_id as string,
      store_id: r.store_id as string,
      campaign_id: r.campaign_id as string,
    }));
  }

  const bas = new Set(allLogs.map((r) => r.ba_id));
  const stores = new Set(allLogs.filter((r) => r.attendance_status === 'present').map((r) => r.store_id));
  const units = allLogs.reduce((s, r) => s + r.units_sold, 0);
  const completed = allLogs.filter((r) => r.status === 'completed').length;
  const open = allLogs.filter((r) => r.status === 'open').length;

  const byDay = new Map<string, { units: number; total: number; completed: number }>();
  for (const r of allLogs) {
    const day = byDay.get(r.attendance_date) ?? { units: 0, total: 0, completed: 0 };
    day.units += r.units_sold;
    day.total += 1;
    if (r.status === 'completed') day.completed += 1;
    byDay.set(r.attendance_date, day);
  }

  const trend: TrendPoint[] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, v]) => ({
      day,
      units: v.units,
      completionPct: v.total === 0 ? 0 : Math.round((v.completed / v.total) * 100),
    }));

  const activeCampaigns = (campaigns ?? []).filter((c) => c.status === 'active').length;

  return (
    <>
      <PageHeader
        title="Campaign Performance"
        description="Aggregate metrics across all campaigns."
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Active campaigns" value={activeCampaigns} />
        <StatCard label="BA-days" value={allLogs.length} />
        <StatCard label="Units sold" value={units} />
        <StatCard label="Completion rate" value={`${allLogs.length ? Math.round((completed / allLogs.length) * 100) : 0}%`} />
        <StatCard label="Active BAs" value={bas.size} />
        <StatCard label="Active stores" value={stores.size} />
        <StatCard label="Completed days" value={completed} />
        <StatCard label="Open / incomplete" value={open} />
      </div>

      <Card className="mt-6">
        <div className="border-b border-ink/8 px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">Sales &amp; completion trends</h2>
          <p className="mt-0.5 text-xs text-muted">Units and completion rate per day across all campaigns.</p>
        </div>
        <TrendsChart data={trend} />
      </Card>

      <Card className="mt-6">
        <div className="border-b border-ink/8 px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">Campaigns</h2>
        </div>
        <div className="divide-y divide-ink/5">
          {(campaigns ?? []).map((c) => {
            const campaignLogs = allLogs.filter((l) => l.campaign_id === c.id);
            const campaignCompleted = campaignLogs.filter((l) => l.status === 'completed').length;
            const campaignUnits = campaignLogs.reduce((s, l) => s + l.units_sold, 0);
            return (
              <div key={c.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-ink">{c.name}</p>
                  <p className="text-xs text-muted">{c.start_date} → {c.end_date ?? 'ongoing'}</p>
                </div>
                <div className="flex gap-6 text-right">
                  <div>
                    <p className="text-sm font-semibold text-ink">{campaignLogs.length}</p>
                    <p className="text-xs text-muted">BA-days</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-ink">{campaignUnits}</p>
                    <p className="text-xs text-muted">Units</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      {campaignLogs.length ? Math.round((campaignCompleted / campaignLogs.length) * 100) : 0}%
                    </p>
                    <p className="text-xs text-muted">Completion</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}

async function BrandAmbassadorOverview({
  brand,
  profile,
}: {
  brand: ClientBrand;
  profile: ClientProfile;
}) {
  const { client } = await requireClient();

  const { data } = await client.rpc('ba_my_history');
  const rows = (Array.isArray(data) ? (data as BaHistoryRow[]) : []);

  const { data: campaignRows } = await client.rpc('ba_my_campaigns');
  const campaignRecords = Array.isArray(campaignRows)
    ? (campaignRows as Record<string, unknown>[])
    : [];
  const activeCampaigns: ActiveCampaign[] = campaignRecords.map((r) => ({
      id: r.campaign_id as string,
      name: r.campaign_name as string,
      status: r.status as string,
      start_date: r.start_date as string,
      end_date: (r.end_date as string | null) ?? null,
    }));

  const units = rows.reduce((s, r) => s + r.units, 0);
  const completed = rows.filter((r) => r.status === 'completed').length;
  const open = rows.filter((r) => r.status === 'open').length;
  const present = rows.filter((r) => r.attendance_status === 'present').length;
  const flagged = rows.filter((r) => r.flagged).length;
  const campaigns = new Set(rows.map((r) => r.campaign_name)).size;
  const stores = new Set(rows.map((r) => r.store_name)).size;

  const byDay = new Map<string, { units: number; total: number; completed: number }>();
  for (const r of rows) {
    const day = byDay.get(r.attendance_date) ?? { units: 0, total: 0, completed: 0 };
    day.units += r.units;
    day.total += 1;
    if (r.status === 'completed') day.completed += 1;
    byDay.set(r.attendance_date, day);
  }

  const trend: TrendPoint[] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, v]) => ({
      day,
      units: v.units,
      completionPct: v.total === 0 ? 0 : Math.round((v.completed / v.total) * 100),
    }));

  return (
    <>
      <WorkProfile
        client={client}
        profile={profile}
        brand={brand}
        activeCampaigns={activeCampaigns}
      />

      <PageHeader
        title={`My Activity — ${brand.name}`}
        description="Your own shifts, sales and check-ins. Data you can see from the mobile app."
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Days logged" value={rows.length} />
        <StatCard label="Units sold" value={units} />
        <StatCard label="Days completed" value={completed} />
        <StatCard label="Open days" value={open} />
        <StatCard label="Days present" value={present} />
        <StatCard label="Stores visited" value={stores} />
        <StatCard label="Campaigns" value={campaigns} />
        <StatCard label="Flagged" value={flagged} />
      </div>

      {rows.length > 0 ? (
        <>
          <Card className="mt-6">
            <div className="border-b border-ink/8 px-5 py-4">
              <h2 className="text-sm font-semibold text-ink">Your sales &amp; completion</h2>
              <p className="mt-0.5 text-xs text-muted">Units and completion rate per day.</p>
            </div>
            <TrendsChart data={trend} />
          </Card>

          <Card className="mt-6">
            <div className="border-b border-ink/8 px-5 py-4">
              <h2 className="text-sm font-semibold text-ink">Recent shifts</h2>
            </div>
            <div className="divide-y divide-ink/5">
              {rows.slice(0, 20).map((r) => (
                <div key={`${r.campaign_name}-${r.store_name}-${r.attendance_date}`} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {r.attendance_date} · {r.store_name}
                    </p>
                    <p className="text-xs text-muted">{r.campaign_name}</p>
                  </div>
                  <div className="flex gap-4 text-right">
                    <div>
                      <p className="text-sm font-semibold text-ink">{r.units}</p>
                      <p className="text-xs text-muted">Units</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {r.status === 'completed' ? '✓ Done' : r.status === 'open' ? 'Open' : r.attendance_status}
                      </p>
                      <p className="text-xs text-muted">{r.flagged ? 'Flagged' : 'Status'}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      ) : (
        <Card className="mt-6">
          <p className="px-5 py-6 text-sm text-muted">
            You haven&apos;t logged any days yet. Shifts you complete on the mobile app will appear here.
          </p>
        </Card>
      )}
    </>
  );
}

export function generateMetadata() {
  return { title: 'Campaign Performance — Brand Dashboard' };
}

type ActiveCampaign = {
  id: string;
  name: string;
  status: string;
  start_date: string;
  end_date: string | null;
};

/**
 * Renders the signed-in brand ambassador's work profile at the top of the
 * dashboard: profile picture, contact details and the campaigns they are
 * actively assigned to. The picture is served via a short-lived signed URL
 * (never persisted) with a graceful fallback when the BA has no photo.
 */
async function WorkProfile({
  client,
  profile,
  brand,
  activeCampaigns,
}: {
  client: FazooClient;
  profile: ClientProfile;
  brand: ClientBrand;
  activeCampaigns: ActiveCampaign[];
}) {
  let photoSrc: string | null = null;
  if (profile.profile_photo_path) {
    const { data } = await client.storage
      .from('profile-photos')
      .createSignedUrl(profile.profile_photo_path, 300);
    photoSrc = data?.signedUrl ?? null;
  }

  const initials = (profile.full_name || 'BA')
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <Card className="mb-6 overflow-hidden">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="flex shrink-0 items-center gap-4 sm:gap-5">
          {photoSrc ? (
            <img
              src={photoSrc}
              alt={`${profile.full_name}'s profile`}
              className="size-16 rounded-full border border-ink/10 object-cover sm:size-20"
            />
          ) : (
            <span className="grid size-16 place-items-center rounded-full bg-primary/10 text-xl font-bold text-primary sm:size-20">
              {initials}
            </span>
          )}
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink">{profile.full_name}</h1>
            <p className="text-sm text-muted">{brand.name}</p>
            <p className="text-xs font-medium uppercase tracking-wider text-primary">Brand Ambassador</p>
          </div>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 sm:pl-5 sm:border-l sm:border-ink/8">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Phone</p>
            <p className="mt-0.5 text-sm text-ink">{profile.phone || '—'}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Brand / workspace</p>
            <p className="mt-0.5 text-sm text-ink">{brand.name}</p>
          </div>
        </div>
      </div>

      <div className="border-t border-ink/8 bg-ink/[0.02] px-5 py-4 sm:px-6">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
          Active campaigns
        </p>
        {activeCampaigns.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {activeCampaigns.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.06] px-3 py-1 text-xs font-medium text-primary"
              >
                {c.name}
                <span className="text-[10px] text-muted">
                  {c.start_date} → {c.end_date ?? 'ongoing'}
                </span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No active campaigns assigned right now.</p>
        )}
      </div>
    </Card>
  );
}
