import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/auth';
import { PageHeader, StatCard } from '@/components/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyRow, Table, TableWrap, Td, Th } from '@/components/ui/table';
import { Badge, attendanceTone } from '@/components/ui/badge';
import { weeklyOffDayName } from '@fazoo/config';

export default async function StoreDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ campaign?: string }>;
}) {
  const { client } = await requireStaff();
  const { id } = await params;
  const { campaign: campaignParam } = await searchParams;
  // Optional campaign scope: when the visitor arrives from a campaign
  // context, every number on this page must only cover that campaign.
  const campaignId =
    campaignParam && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(campaignParam)
      ? campaignParam
      : null;

  let assignmentQuery = client
    .from('brand_ambassador_assignments')
    .select(`
      *, profiles ( id, full_name ), campaigns ( name )
    `)
    .eq('store_id', id)
    .order('start_date', { ascending: false });
  if (campaignId) assignmentQuery = assignmentQuery.eq('campaign_id', campaignId);

  const [{ data: store }, { data: assignments }, { data: campaign }] = await Promise.all([
    client.from('stores').select('*').eq('id', id).single(),
    assignmentQuery,
    campaignId
      ? client.from('campaigns').select('name').eq('id', campaignId).single()
      : Promise.resolve({ data: null }),
  ]);

  if (!store) notFound();

  let logQuery = client
    .from('daily_logs')
    .select(`
      id, attendance_date, attendance_status, status,
      sales_entries ( quantity )
    `)
    .eq('store_id', id)
    .order('attendance_date', { ascending: false })
    .limit(500);
  if (campaignId) logQuery = logQuery.eq('campaign_id', campaignId);
  const { data: logs } = await logQuery;

  const presentLogs = (logs ?? []).filter((l) => l.attendance_status === 'present');
  const completed = (logs ?? []).filter((l) => l.status === 'completed').length;
  const sick = (logs ?? []).filter((l) => l.attendance_status === 'sick_leave').length;
  const units = (logs ?? []).reduce(
    (sum, l) => sum + (l.sales_entries as unknown as Array<{ quantity: number }>).reduce((s, e) => s + e.quantity, 0),
    0,
  );
  const skuTotals = new Map<string, number>();

  // SKU totals for this store — SKUs are campaign-scoped, so when a campaign
  // is selected only that campaign's products and units appear.
  let skuQuery = client
    .from('sales_entries')
    .select('quantity, skus ( name ), daily_logs!inner ( store_id )')
    .eq('daily_logs.store_id', id)
    .limit(20000);
  if (campaignId) skuQuery = skuQuery.eq('daily_logs.campaign_id', campaignId);
  const { data: skuRows } = await skuQuery;
  for (const r of skuRows ?? []) {
    const name = (r.skus as unknown as { name: string }).name;
    skuTotals.set(name, (skuTotals.get(name) ?? 0) + r.quantity);
  }

  return (
    <>
      <PageHeader
        title={store.name}
        description={
          campaignId && campaign?.name
            ? [store.address, campaign.name].filter(Boolean).join(' · ')
            : (store.address ?? undefined)
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatCard label="Total units" value={units} />
        <StatCard label="Attendance" value={presentLogs.length} hint="present BA-days" />
        <StatCard label="Completed days" value={completed} />
        <StatCard label="Sick leave" value={sick} />
        <StatCard
          label="Geofence"
          value={`${store.geofence_radius_metres} m`}
          hint={`${store.latitude.toFixed(4)}, ${store.longitude.toFixed(4)}`}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Assigned BAs" description="Current and historical." />
          <CardBody className="p-0">
            <TableWrap className="rounded-none border-0">
              <Table>
                <thead>
                  <tr><Th>BA</Th><Th>Campaign</Th><Th>Weekly off</Th><Th>Status</Th></tr>
                </thead>
                <tbody>
                  {(assignments ?? []).length === 0 ? (
                    <EmptyRow colSpan={4}>No BAs assigned.</EmptyRow>
                  ) : (
                    (assignments ?? []).map((a) => (
                      <tr key={a.id}>
                        <Td className="font-medium">{a.profiles?.full_name}</Td>
                        <Td>{a.campaigns?.name}</Td>
                        <Td>{weeklyOffDayName(a.weekly_off_day)}</Td>
                        <Td>
                          <Badge tone={a.status === 'active' ? 'success' : 'neutral'}>{a.status}</Badge>
                        </Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </TableWrap>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="SKU sales" description="Units by product at this store." />
          <CardBody className="p-0">
            <TableWrap className="rounded-none border-0">
              <Table>
                <thead>
                  <tr><Th>SKU</Th><Th className="text-right">Units</Th></tr>
                </thead>
                <tbody>
                  {skuTotals.size === 0 ? (
                    <EmptyRow colSpan={2}>No sales yet.</EmptyRow>
                  ) : (
                    [...skuTotals.entries()].sort((a, b) => b[1] - a[1]).map(([name, qty]) => (
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

      <TableWrap className="mt-6">
        <Table>
          <thead>
            <tr><Th>Date</Th><Th>Attendance</Th><Th>Status</Th><Th className="text-right">Units</Th></tr>
          </thead>
          <tbody>
            {(logs ?? []).length === 0 ? (
              <EmptyRow colSpan={4}>No logs for this store.</EmptyRow>
            ) : (
              (logs ?? []).slice(0, 50).map((l) => (
                <tr key={l.id}>
                  <Td>{l.attendance_date}</Td>
                  <Td><Badge tone={attendanceTone(l.attendance_status)}>{l.attendance_status.replace('_', ' ')}</Badge></Td>
                  <Td>{l.status}</Td>
                  <Td className="text-right tabular-nums">
                    {(l.sales_entries as unknown as Array<{ quantity: number }>).reduce((s, e) => s + e.quantity, 0)}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </TableWrap>
    </>
  );
}
