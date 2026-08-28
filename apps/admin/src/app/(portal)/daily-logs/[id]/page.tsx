import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/auth';
import { mapsLink, formatLagosDisplay } from '@/lib/format';
import { Badge, attendanceTone, completionBadge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Table, TableWrap, Td, Th } from '@/components/ui/table';

export default async function DailyLogDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { client } = await requireStaff();
  const { id } = await params;

  const { data: raw } = await client
    .from('daily_logs')
    .select(`
      *,
      profiles!daily_logs_brand_ambassador_id_fkey ( id, full_name, phone ),
      stores!daily_logs_store_id_fkey ( id, name, address ),
      campaigns!daily_logs_campaign_id_fkey ( name ),
      sales_entries ( id, quantity, recorded_at, skus ( name, code ) ),
      daily_log_photos ( id, photo_type, storage_path, captured_at )
    `)
    .eq('id', id)
    .single();

  if (!raw) notFound();

  const log = raw as unknown as {
    id: string;
    attendance_date: string;
    attendance_status: string;
    status: string;
    flagged: boolean;
    checkin_at: string | null;
    checkout_at: string | null;
    checkin_latitude: number | null;
    checkin_longitude: number | null;
    checkout_latitude: number | null;
    checkout_longitude: number | null;
    checkin_distance_metres: number | null;
    checkout_distance_metres: number | null;
    notes: string | null;
    profiles: { id: string; full_name: string; phone: string } | null;
    stores: { id: string; name: string; address: string | null } | null;
    campaigns: { name: string } | null;
    sales_entries: Array<{
      id: string;
      quantity: number;
      recorded_at: string;
      skus: { name: string; code: string } | null;
    }> | null;
    daily_log_photos: Array<{ id: string; photo_type: string; storage_path: string; captured_at: string }> | null;
  };

  const totalUnits = (log.sales_entries ?? []).reduce((s, e) => s + e.quantity, 0);
  const photos: Array<[string, { id: string; storage_path: string } | undefined]> = [
    ['Stock on shelf · check-in', log.daily_log_photos?.find((p) => p.photo_type === 'stock_shelf')],
    ['Uniform selfie · check-in', log.daily_log_photos?.find((p) => p.photo_type === 'uniform_selfie')],
    ['Stock on shelf · check-out', log.daily_log_photos?.find((p) => p.photo_type === 'checkout_stock_shelf')],
    ['Uniform selfie · check-out', log.daily_log_photos?.find((p) => p.photo_type === 'checkout_uniform_selfie')],
  ];
  const anyPhoto = photos.some(([, p]) => Boolean(p));
  const checkinMap = mapsLink(log.checkin_latitude, log.checkin_longitude);
  const checkoutMap = mapsLink(log.checkout_latitude, log.checkout_longitude);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">
            Daily log — {log.profiles?.full_name ?? 'Unknown BA'}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {log.attendance_date} · {log.stores?.name ?? ''} · {log.campaigns?.name ?? ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge tone={attendanceTone(log.attendance_status)}>
            {log.attendance_status.replace('_', ' ')}
          </Badge>
          {completionBadge(log.status)}
          {log.flagged ? <Badge tone="warning">Flagged for review</Badge> : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Check-in / checkout" description="Times shown in Africa/Lagos." />
          <CardBody className="space-y-3 text-sm">
            <dl className="grid grid-cols-[140px_1fr] gap-y-2">
              <dt className="text-muted">Check-in</dt>
              <dd>{log.checkin_at ? formatLagosDisplay(log.checkin_at) : '—'}</dd>
              <dt className="text-muted">Check-in GPS</dt>
              <dd>
                {checkinMap ? (
                  <a className="text-deep underline" href={checkinMap} target="_blank" rel="noreferrer noopener">
                    {log.checkin_latitude?.toFixed(5)}, {log.checkin_longitude?.toFixed(5)} — map ↗
                  </a>
                ) : '—'}
                {log.checkin_distance_metres !== null ? (
                  <span className="ml-2 text-muted">({log.checkin_distance_metres} m from store)</span>
                ) : null}
              </dd>
              <dt className="text-muted">Checkout</dt>
              <dd>{log.checkout_at ? formatLagosDisplay(log.checkout_at) : '—'}</dd>
              <dt className="text-muted">Checkout GPS</dt>
              <dd>
                {checkoutMap ? (
                  <a className="text-deep underline" href={checkoutMap} target="_blank" rel="noreferrer noopener">
                    {log.checkout_latitude?.toFixed(5)}, {log.checkout_longitude?.toFixed(5)} — map ↗
                  </a>
                ) : '—'}
                {log.checkout_distance_metres !== null ? (
                  <span className="ml-2 text-muted">({log.checkout_distance_metres} m from store)</span>
                ) : null}
              </dd>
              <dt className="text-muted">Notes</dt>
              <dd>{log.notes ?? '—'}</dd>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="People & place" />
          <CardBody className="space-y-3 text-sm">
            <dl className="grid grid-cols-[140px_1fr] gap-y-2">
              <dt className="text-muted">Brand Ambassador</dt>
              <dd>
                <Link className="text-deep underline" href={`/brand-ambassadors/${log.profiles?.id}`}>
                  {log.profiles?.full_name}
                </Link>{' '}
                <span className="font-mono text-xs text-muted">{log.profiles?.phone}</span>
              </dd>
              <dt className="text-muted">Store</dt>
              <dd>
                {log.stores?.name}
                {log.stores?.address ? <span className="block text-xs text-muted">{log.stores.address}</span> : null}
              </dd>
            </dl>
            {(anyPhoto) && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                {photos.map(
                  ([label, p]) =>
                    p ? (
                      <figure key={p.id}>
                        <PhotoFrame path={p.storage_path} />
                        <figcaption className="mt-1 text-center text-xs text-muted">{label}</figcaption>
                      </figure>
                    ) : null,
                )}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <TableWrap className="mt-6">
        <caption className="sr-only">Sales by SKU for this day</caption>
        <Table>
          <thead>
            <tr>
              <Th>SKU</Th>
              <Th>Code</Th>
              <Th>Recorded</Th>
              <Th className="text-right">Quantity</Th>
            </tr>
          </thead>
          <tbody>
            {(log.sales_entries ?? []).map((e) => (
              <tr key={e.id}>
                <Td>{e.skus?.name ?? e.skus?.code}</Td>
                <Td className="font-mono text-xs">{e.skus?.code}</Td>
                <Td>{formatLagosDisplay(e.recorded_at)}</Td>
                <Td className="text-right tabular-nums font-medium">{e.quantity}</Td>
              </tr>
            ))}
            <tr>
              <Td className="font-semibold">Total units</Td>
              <Td /><Td />
              <Td className="text-right tabular-nums font-semibold">{totalUnits}</Td>
            </tr>
          </tbody>
        </Table>
      </TableWrap>
    </>
  );
}

/**
 * Renders a private photo through a short-lived signed URL minted by the
 * user's own session (RLS policy storage_read_org_admin). The URL is never
 * persisted and expires in minutes.
 */
async function PhotoFrame({ path }: { path: string }) {
  const { client } = await requireStaff();
  const bucket = path.includes('/') && !path.startsWith('profile') ? 'daily-log-photos' : 'profile-photos';
  const { data } = await client.storage.from(bucket).createSignedUrl(path, 300);
  if (!data) {
    return <div className="h-40 w-full rounded-lg bg-ink/5" aria-label="photo unavailable" />;
  }
  return (
    <img
      src={data.signedUrl}
      alt=""
      className="h-40 w-full rounded-lg object-cover"
      loading="lazy"
    />
  );
}
