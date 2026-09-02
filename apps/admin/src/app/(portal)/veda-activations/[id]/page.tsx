import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/auth';
import { mapsLink } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Table, TableWrap, Td, Th } from '@/components/ui/table';
import { PhotoFrame } from '@/components/photo-frame';
import { formatNairobiDisplay } from '@fazoo/config';

interface VedaSessionDetail {
  id: string;
  session_date: string;
  status: string;
  learner_count: number;
  checkin_at: string | null;
  checkout_at: string | null;
  checkin_latitude: number | null;
  checkin_longitude: number | null;
  checkout_latitude: number | null;
  checkout_longitude: number | null;
  checkin_distance_metres: number | null;
  notes: string | null;
  profiles: { id: string; full_name: string; phone: string } | null;
  veda_schools: {
    id: string;
    name: string;
    region: string | null;
    address: string | null;
    geofence_radius_metres: number | null;
  } | null;
  veda_session_distributions: Array<{
    id: string;
    quantity: number;
    stationery_item: { id: string; name: string; code: string | null } | null;
  }> | null;
}

export default async function VedaActivationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { client } = await requireStaff();
  const { id } = await params;

  const { data: raw } = await client
    .from('veda_sessions')
    .select(
      `*,
       profiles!veda_sessions_brand_ambassador_id_fkey ( id, full_name, phone ),
       veda_schools!veda_sessions_school_id_fkey ( id, name, region, address ),
       veda_session_distributions (
         id, quantity,
         stationery_item:veda_stationery_items!veda_session_distributions_stationery_item_id_fkey ( id, name, code )
       )`,
    )
    .eq('id', id)
    .single();

  if (!raw) notFound();

  const session = raw as unknown as VedaSessionDetail;

  const { data: photos } = await client
    .from('veda_session_photos')
    .select('id, photo_type, storage_path, captured_at')
    .eq('session_id', id)
    .order('photo_type');
  const photoList = (photos ?? []) as Array<{
    id: string;
    photo_type: 'site_selfie' | 'stamped_document';
    storage_path: string;
    captured_at: string;
  }>;

  const unitPhotos: Array<[string, (typeof photoList)[number] | undefined]> = [
    ['Site selfie · check-in', photoList.find((p) => p.photo_type === 'site_selfie')],
    ['Stamped document', photoList.find((p) => p.photo_type === 'stamped_document')],
  ];
  const anyPhoto = unitPhotos.some(([, p]) => Boolean(p));
  const totalUnits = (session.veda_session_distributions ?? []).reduce((s, d) => s + d.quantity, 0);
  const checkinMap = mapsLink(session.checkin_latitude, session.checkin_longitude);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">
            Brand activation — {session.profiles?.full_name ?? 'Unknown BA'}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {session.session_date} · {session.veda_schools?.name ?? ''}
            {session.veda_schools?.region ? ` · ${session.veda_schools.region}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge tone={session.status === 'completed' ? 'success' : session.status === 'open' ? 'warning' : 'neutral'}>
            {session.status}
          </Badge>
          <Link
            href="/veda-activations"
            className="text-sm font-medium text-primary hover:underline"
          >
            ← Back to activations
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Visit timeline" description="Times shown in Africa/Nairobi." />
          <CardBody className="space-y-3 text-sm">
            <dl className="grid grid-cols-[140px_1fr] gap-y-2">
              <dt className="text-muted">Check-in</dt>
              <dd>{session.checkin_at ? formatNairobiDisplay(session.checkin_at) : '—'}</dd>
              <dt className="text-muted">Check-in GPS</dt>
              <dd>
                {checkinMap ? (
                  <a className="text-deep underline" href={checkinMap} target="_blank" rel="noreferrer noopener">
                    {session.checkin_latitude?.toFixed(5)}, {session.checkin_longitude?.toFixed(5)} — map ↗
                  </a>
                ) : '—'}
                {session.checkin_distance_metres !== null ? (
                  <span className="ml-2 text-muted">
                    ({session.checkin_distance_metres} m from school)
                  </span>
                ) : null}
              </dd>
              <dt className="text-muted">Checkout</dt>
              <dd>{session.checkout_at ? formatNairobiDisplay(session.checkout_at) : '—'}</dd>
              <dt className="text-muted">Learners</dt>
              <dd className="tabular-nums">{session.learner_count}</dd>
              <dt className="text-muted">Notes</dt>
              <dd>{session.notes ?? '—'}</dd>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Brand Ambassador & school" />
          <CardBody className="space-y-3 text-sm">
            <dl className="grid grid-cols-[140px_1fr] gap-y-2">
              <dt className="text-muted">Brand Ambassador</dt>
              <dd>
                <Link className="text-deep underline" href={`/brand-ambassadors/${session.profiles?.id}`}>
                  {session.profiles?.full_name}
                </Link>{' '}
                <span className="font-mono text-xs text-muted">{session.profiles?.phone}</span>
              </dd>
              <dt className="text-muted">School</dt>
              <dd>
                {session.veda_schools?.name}
                {session.veda_schools?.address ? (
                  <span className="block text-xs text-muted">{session.veda_schools.address}</span>
                ) : null}
                {session.veda_schools?.geofence_radius_metres != null ? (
                  <span className="block text-xs text-muted">
                    geofence {session.veda_schools.geofence_radius_metres} m
                  </span>
                ) : null}
              </dd>
            </dl>
            {anyPhoto && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                {unitPhotos.map(
                  ([label, p]) =>
                    p ? (
                      <figure key={p.id}>
                        <PhotoFrame path={p.storage_path} />
                        <figcaption className="mt-1 text-center text-xs text-muted">
                          {label}
                          {p.captured_at ? ` · ${formatNairobiDisplay(p.captured_at)}` : ''}
                        </figcaption>
                      </figure>
                    ) : null,
                )}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <TableWrap className="mt-6">
        <caption className="sr-only">Stationery distributed during this visit</caption>
        <Table>
          <thead>
            <tr>
              <Th>Stationery item</Th>
              <Th>Code</Th>
              <Th className="text-right">Units issued</Th>
            </tr>
          </thead>
          <tbody>
            {(session.veda_session_distributions ?? []).map((d) => (
              <tr key={d.id}>
                <Td>{d.stationery_item?.name ?? 'Unknown item'}</Td>
                <Td className="font-mono text-xs">{d.stationery_item?.code}</Td>
                <Td className="text-right tabular-nums font-medium">{d.quantity}</Td>
              </tr>
            ))}
            <tr>
              <Td className="font-semibold">Total units</Td>
              <Td />
              <Td className="text-right tabular-nums font-semibold">{totalUnits}</Td>
            </tr>
          </tbody>
        </Table>
      </TableWrap>
    </>
  );
}