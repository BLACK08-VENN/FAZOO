import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireStaff, isElevated } from '@/lib/auth';
import { PageHeader, StatCard } from '@/components/page';
import { PhotoFrame, photoTypeLabel } from '@/components/photo-frame';
import { Badge, attendanceTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyRow, Table, TableWrap, Td, Th } from '@/components/ui/table';
import { formatLagosDisplay } from '@/lib/format';
import { weeklyOffDayName } from '@fazoo/config';
import { deleteBaAction } from '../actions';
import { editBaAssignmentAction } from './actions';

export default async function BADetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; campaign?: string }>;
}) {
  const { client, profile: actor } = await requireStaff();
  const { id } = await params;
  const { error, saved, campaign: campaignParam } = await searchParams;
  // Optional campaign scope — arriving from a campaign context must never
  // surface another campaign's attendance, sales or photos for this BA.
  const campaignId =
    campaignParam && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(campaignParam)
      ? campaignParam
      : null;
  const { data: stores } = await client.from('stores').select('id, name, organization_id')
    .eq('organization_id', actor.organization_id).eq('status', 'active').order('name');
  const elevated = isElevated(actor.role);

  let assignmentQuery = client
    .from('brand_ambassador_assignments')
    .select(
      `
      *, campaigns ( name ), stores ( name )
    `,
    )
    .eq('brand_ambassador_id', id)
    .order('start_date', { ascending: false });
  if (campaignId) assignmentQuery = assignmentQuery.eq('campaign_id', campaignId);

  const [{ data: profile }, { data: assignments }, { data: campaign }] = await Promise.all([
    client.from('profiles').select('*').eq('id', id).single(),
    assignmentQuery,
    campaignId
      ? client.from('campaigns').select('name').eq('id', campaignId).single()
      : Promise.resolve({ data: null }),
  ]);

  if (!profile) notFound();

  let presentQuery = client
    .from('daily_logs')
    .select('id', { count: 'exact', head: true })
    .eq('brand_ambassador_id', id)
    .eq('attendance_status', 'present');
  let sickQuery = client
    .from('daily_logs')
    .select('id', { count: 'exact', head: true })
    .eq('brand_ambassador_id', id)
    .eq('attendance_status', 'sick_leave');
  let baLogIdsQuery = client
    .from('daily_logs')
    .select('id')
    .eq('brand_ambassador_id', id)
    .limit(2000);
  let photoQuery = client
    .from('daily_log_photos')
    .select(
      `id, photo_type, storage_path, captured_at,
       daily_logs!inner ( id, attendance_date )`,
    )
    .eq('daily_logs.brand_ambassador_id', id)
    .order('captured_at', { ascending: false })
    .limit(12);
  if (campaignId) {
    presentQuery = presentQuery.eq('campaign_id', campaignId);
    sickQuery = sickQuery.eq('campaign_id', campaignId);
    baLogIdsQuery = baLogIdsQuery.eq('campaign_id', campaignId);
    photoQuery = photoQuery.eq('daily_logs.campaign_id', campaignId);
  }

  const [{ count: presentDays }, { count: sickDays }, { data: salesAgg }, { data: recentPhotos }] =
    await Promise.all([
      presentQuery,
      sickQuery,
      client
        .from('sales_entries')
        .select('quantity, skus ( name )')
        .in(
          'daily_log_id',
          (await baLogIdsQuery).data?.map((d) => d.id) ?? ['00000000-0000-0000-0000-000000000000'],
        ),
      photoQuery,
    ]);

  type RecentPhoto = {
    id: string;
    photo_type: string;
    storage_path: string;
    captured_at: string;
    daily_logs: { id: string; attendance_date: string } | null;
  };

  const totalUnits = (salesAgg ?? []).reduce((s, e) => s + e.quantity, 0);
  const skuBreakdown = new Map<string, number>();
  for (const e of salesAgg ?? []) {
    const name = (e.skus as unknown as { name: string } | null)?.name ?? 'Unknown SKU';
    skuBreakdown.set(name, (skuBreakdown.get(name) ?? 0) + e.quantity);
  }

  return (
    <>
      <PageHeader
        title={profile.full_name}
        description={
          campaignId && campaign?.name
            ? `${profile.phone} · ${campaign.name}`
            : profile.phone
        }
      >
        {profile.profile_photo_path ? (
          <div className="flex items-center gap-3 sm:justify-self-end">
            <PhotoFrame
              path={profile.profile_photo_path}
              alt={`${profile.full_name}'s profile`}
              className="size-16 rounded-full border border-ink/10 object-cover sm:size-20"
              expandable
            />
          </div>
        ) : null}
      </PageHeader>

      {saved ? <p role="status" className="mb-4 rounded-xl bg-success/10 p-3 text-sm">Store and off days updated.</p> : null}

      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-bad/20 bg-bad/10 p-3 text-sm font-medium text-bad"
        >
          {error}
        </p>
      ) : null}

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge tone={attendanceTone(profile.account_status)}>{profile.account_status}</Badge>
        <Badge tone="neutral">{profile.role.replace('_', ' ')}</Badge>
      </div>

      {elevated && actor.id !== id ? (
        <Card className="mb-6">
          <CardHeader
            title="Danger zone"
            description="Permanently remove this BA and all their assignments, attendance and sales history."
          />
          <CardBody>
            <form action={deleteBaAction}>
              <input type="hidden" name="profile_id" value={id} />
              <p className="mb-3 text-sm text-muted">
                This cannot be undone. The BA&apos;s login and all associated data will be
                deleted. Use the suspension action instead if you only need to pause them.
              </p>
              <Button type="submit" variant="destructive">
                Delete brand ambassador
              </Button>
            </form>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Present days" value={presentDays ?? 0} />
        <StatCard label="Sick-leave days" value={sickDays ?? 0} />
        <StatCard label="Total units sold" value={totalUnits} />
        <StatCard
          label="Completed-day rate"
          value={
            presentDays
              ? `${Math.round(((presentDays ?? 0) / Math.max(1, (presentDays ?? 0) + (sickDays ?? 0))) * 100)}%`
              : '—'
          }
          hint="Present ÷ all recorded days"
        />
      </div>

      {(recentPhotos ?? []).length > 0 && (
        <Card className="mt-6">
          <CardHeader
            title="Recent photos"
            description="Latest check-in, checkout and stock evidence. Click a photo to open it full size."
          />
          <CardBody>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {((recentPhotos ?? []) as RecentPhoto[]).map((p) => {
                const logId = p.daily_logs?.id;
                const frame = (
                  <PhotoFrame
                    path={p.storage_path}
                    alt={photoTypeLabel(p.photo_type)}
                    className="h-36 w-full rounded-lg object-cover"
                  />
                );
                return (
                  <figure key={p.id}>
                    {logId ? (
                      <Link href={`/daily-logs/${logId}`} title="Open the daily log">
                        {frame}
                      </Link>
                    ) : (
                      frame
                    )}
                    <figcaption className="mt-1 text-xs text-muted">
                      {photoTypeLabel(p.photo_type)}
                      <span className="block text-[11px]">
                        {p.daily_logs?.attendance_date ?? formatLagosDisplay(p.captured_at)}
                      </span>
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Assignment history"
            description="Edit the assigned store and weekly off days for each campaign."
          />
          <CardBody className="p-0">
            <TableWrap className="rounded-none border-0">
              <Table>
                <thead>
                  <tr>
                    <Th>Campaign</Th>
                    <Th>Store</Th>
                    <Th>Weekly off</Th>
                    <Th>Period</Th>
                    <Th>Status</Th>
                    {elevated ? <Th>Edit</Th> : null}
                  </tr>
                </thead>
                <tbody>
                  {(assignments ?? []).length === 0 ? (
                    <EmptyRow colSpan={elevated ? 6 : 5}>No assignments yet.</EmptyRow>
                  ) : (
                    (assignments ?? []).map((a) => (
                      <tr key={a.id}>
                        <Td>{a.campaigns?.name}</Td>
                        <Td>{a.stores?.name}</Td>
                        <Td>{weeklyOffDayName(a.weekly_off_day)}</Td>
                        <Td className="text-xs">
                          {a.start_date} → {a.end_date ?? 'ongoing'}
                        </Td>
                        <Td>
                          <Badge tone={a.status === 'active' ? 'success' : 'neutral'}>
                            {a.status}
                          </Badge>
                        </Td>
                        {elevated ? (
                          <Td>
                            <details className="min-w-56">
                              <summary className="cursor-pointer font-medium text-brand">Edit store &amp; off days</summary>
                              <form action={editBaAssignmentAction} className="mt-3 space-y-3">
                                <input type="hidden" name="assignment_id" value={a.id} />
                                <label className="block text-sm">
                                  Store
                                  <select name="store_id" defaultValue={a.store_id ?? ''} className="mt-1 w-full rounded-lg border border-line bg-surface p-2">
                                    <option value="">No store assigned</option>
                                    {(stores ?? []).filter((store) => store.organization_id === a.organization_id).map((store) => (
                                      <option key={store.id} value={store.id}>{store.name}</option>
                                    ))}
                                    {a.store_id && !(stores ?? []).some((store) => store.id === a.store_id) ? (
                                      <option value={a.store_id}>{a.stores?.name ?? 'Current store'} (inactive)</option>
                                    ) : null}
                                  </select>
                                </label>
                                <fieldset>
                                  <legend className="text-sm font-medium">Weekly off days</legend>
                                  <div className="mt-2 grid grid-cols-2 gap-2">
                                    {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, index) => (
                                      <label key={day} className="flex items-center gap-2 text-sm">
                                        <input type="checkbox" name="weekly_off_day" value={index} defaultChecked={a.weekly_off_day.includes(index)} />
                                        {day}
                                      </label>
                                    ))}
                                  </div>
                                  <p className="mt-2 text-xs text-muted">Choose up to four days. Leave all unchecked for no weekly off day.</p>
                                </fieldset>
                                <Button type="submit">Save changes</Button>
                              </form>
                            </details>
                          </Td>
                        ) : null}
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </TableWrap>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="SKU breakdown" description="Lifetime units by product." />
          <CardBody className="p-0">
            <TableWrap className="rounded-none border-0">
              <Table>
                <thead>
                  <tr>
                    <Th>SKU</Th>
                    <Th className="text-right">Units</Th>
                  </tr>
                </thead>
                <tbody>
                  {skuBreakdown.size === 0 ? (
                    <EmptyRow colSpan={2}>No sales recorded yet.</EmptyRow>
                  ) : (
                    [...skuBreakdown.entries()]
                      .sort((a, b) => b[1] - a[1])
                      .map(([name, qty]) => (
                        <tr key={name}>
                          <Td>{name}</Td>
                          <Td className="text-right tabular-nums font-medium">{qty}</Td>
                        </tr>
                      ))
                  )}
                </tbody>
              </Table>
            </TableWrap>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
