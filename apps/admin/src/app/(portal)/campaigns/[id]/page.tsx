import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, isElevated } from '@/lib/auth';
import { weeklyOffDayName } from '@fazoo/config';
import { PageHeader, StatCard } from '@/components/page';
import { Badge, attendanceTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { EmptyRow, Table, TableWrap, Td, Th } from '@/components/ui/table';
import { addBaToCampaignAction, removeBaFromCampaignAction } from './actions';

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { client, profile: actor } = await requireStaff();
  const { id } = await params;
  const elevated = isElevated(actor.role);

  const { data: campaign } = await client
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .single();

  if (!campaign) notFound();

  const [{ data: assignments }, { data: skus }, { data: logs }, { data: bas }, { data: stores }] =
    await Promise.all([
      client
        .from('brand_ambassador_assignments')
        .select(
          `
          *, profiles ( id, full_name, phone ), stores ( id, name )
        `,
        )
        .eq('campaign_id', id)
        .order('start_date', { ascending: false }),
      client
        .from('skus')
        .select('*')
        .eq('campaign_id', id)
        .order('name'),
      client
        .from('daily_logs')
        .select(
          `
          id, attendance_date, attendance_status, status, flagged,
          checkin_at, checkout_at, notes,
          profiles!daily_logs_brand_ambassador_id_fkey ( id, full_name ),
          stores!daily_logs_store_id_fkey ( name ),
          sales_entries ( quantity, skus ( name ) )
        `,
        )
        .eq('campaign_id', id)
        .order('attendance_date', { ascending: false })
        .order('checkin_at', { ascending: false })
        .limit(1000),
      client
        .from('profiles')
        .select('id, full_name')
        .eq('role', 'brand_ambassador')
        .eq('account_status', 'approved')
        .order('full_name'),
      client
        .from('stores')
        .select('id, name')
        .eq('status', 'active')
        .order('name'),
    ]);

  const presentLogs = (logs ?? []).filter((l) => l.attendance_status === 'present');
  const sickLogs = (logs ?? []).filter((l) => l.attendance_status === 'sick_leave');
  const completedLogs = (logs ?? []).filter((l) => l.status === 'completed');
  const totalUnits = (logs ?? []).reduce(
    (sum, l) =>
      sum +
      (l.sales_entries as unknown as Array<{ quantity: number }>).reduce(
        (s, e) => s + e.quantity,
        0,
      ),
    0,
  );
  const uniqueStores = new Set(
    (assignments ?? []).map((a) => (a.stores as unknown as { id: string })?.id).filter(Boolean),
  );
  const assignedBaIds = new Set(
    (assignments ?? [])
      .filter((a) => a.status === 'active')
      .map((a) => a.brand_ambassador_id),
  );

  // Group logs by date
  const logsByDate = new Map<
    string,
    Array<{
      id: string;
      attendance_status: string;
      status: string;
      flagged: boolean;
      ba_name: string;
      ba_id: string;
      store_name: string;
      checkin_at: string | null;
      checkout_at: string | null;
      notes: string | null;
      units: number;
      skuBreakdown: Map<string, number>;
    }>
  >();

  for (const log of logs ?? []) {
    const date = log.attendance_date;
    if (!logsByDate.has(date)) logsByDate.set(date, []);

    const salesEntries = (log.sales_entries as unknown as Array<{
      quantity: number;
      skus: { name: string } | null;
    }>) ?? [];

    const skuBreakdown = new Map<string, number>();
    for (const e of salesEntries) {
      const name = e.skus?.name ?? 'Unknown SKU';
      skuBreakdown.set(name, (skuBreakdown.get(name) ?? 0) + e.quantity);
    }

    const units = salesEntries.reduce((s, e) => s + e.quantity, 0);

    logsByDate.get(date)!.push({
      id: log.id,
      attendance_status: log.attendance_status,
      status: log.status,
      flagged: log.flagged,
      ba_name:
        (log.profiles as unknown as { full_name: string } | null)?.full_name ?? 'Unknown',
      ba_id:
        (log.profiles as unknown as { id: string } | null)?.id ?? '',
      store_name:
        (log.stores as unknown as { name: string } | null)?.name ?? 'Unknown',
      checkin_at: log.checkin_at,
      checkout_at: log.checkout_at,
      notes: log.notes,
      units,
      skuBreakdown,
    });
  }

  // SKU totals
  const skuTotals = new Map<string, number>();
  for (const log of logs ?? []) {
    const entries = (log.sales_entries as unknown as Array<{
      quantity: number;
      skus: { name: string } | null;
    }>) ?? [];
    for (const e of entries) {
      const name = e.skus?.name ?? 'Unknown SKU';
      skuTotals.set(name, (skuTotals.get(name) ?? 0) + e.quantity);
    }
  }

  const statusTone = (status: string) => {
    switch (status) {
      case 'active':
        return 'success' as const;
      case 'completed':
        return 'purple' as const;
      case 'cancelled':
        return 'danger' as const;
      default:
        return 'neutral' as const;
    }
  };

  return (
    <>
      <PageHeader
        title={campaign.name}
        description={`${campaign.start_date} → ${campaign.end_date ?? 'open'} · ${campaign.description ?? ''}`}
      >
        <div className="flex gap-2">
          <Badge tone={statusTone(campaign.status)}>{campaign.status}</Badge>
          {campaign.access_code ? (
            <Badge tone="warning">Passcode set</Badge>
          ) : null}
        </div>
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-6">
        <StatCard
          label="Logs"
          value={(logs ?? []).length}
          hint={`${completedLogs.length} completed`}
        />
        <StatCard label="Present" value={presentLogs.length} />
        <StatCard label="Sick leave" value={sickLogs.length} />
        <StatCard label="Units" value={totalUnits} />
        <StatCard label="BAs" value={(assignments ?? []).filter((a) => a.status === 'active').length} />
        <StatCard label="Stores" value={uniqueStores.size} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Assigned BAs */}
        <Card>
          <CardHeader
            title="Assigned BAs"
            description={`${(assignments ?? []).filter((a) => a.status === 'active').length} active · ${(assignments ?? []).filter((a) => a.status !== 'active').length} ended`}
          />
          <CardBody className="p-0">
            <TableWrap className="rounded-none border-0">
              <Table>
                <thead>
                  <tr>
                    <Th>BA</Th>
                    <Th>Store</Th>
                    <Th>Weekly off</Th>
                    <Th>Status</Th>
                    {elevated ? <Th /> : null}
                  </tr>
                </thead>
                <tbody>
                  {(assignments ?? []).length === 0 ? (
                    <EmptyRow colSpan={elevated ? 5 : 4}>
                      No BAs assigned yet.
                    </EmptyRow>
                  ) : (
                    (assignments ?? []).map((a) => (
                      <tr key={a.id}>
                        <Td>
                          <Link
                            href={`/brand-ambassadors/${a.brand_ambassador_id}`}
                            className="text-deep underline"
                          >
                            {(a.profiles as unknown as { full_name: string } | null)?.full_name}
                          </Link>
                        </Td>
                        <Td>
                          {(a.stores as unknown as { name: string } | null)?.name ?? (
                            <span className="text-muted italic">N/A</span>
                          )}
                        </Td>
                        <Td>{weeklyOffDayName(a.weekly_off_day)}</Td>
                        <Td>
                          <Badge
                            tone={a.status === 'active' ? 'success' : 'neutral'}
                          >
                            {a.status}
                          </Badge>
                        </Td>
                        {elevated ? (
                          <Td>
                            {a.status === 'active' ? (
                              <form action={removeBaFromCampaignAction}>
                                <input type="hidden" name="assignment_id" value={a.id} />
                                <input type="hidden" name="campaign_id" value={id} />
                                <Button
                                  type="submit"
                                  variant="destructive"
                                  size="sm"
                                >
                                  Remove
                                </Button>
                              </form>
                            ) : null}
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

        {/* SKUs */}
        <Card>
          <CardHeader
            title="SKUs"
            description={`${(skus ?? []).filter((s) => s.status === 'active').length} active`}
          />
          <CardBody className="p-0">
            <TableWrap className="rounded-none border-0">
              <Table>
                <thead>
                  <tr>
                    <Th>Name</Th>
                    <Th>Code</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Units sold</Th>
                  </tr>
                </thead>
                <tbody>
                  {(skus ?? []).length === 0 ? (
                    <EmptyRow colSpan={4}>No SKUs in this campaign.</EmptyRow>
                  ) : (
                    (skus ?? []).map((sku) => (
                      <tr key={sku.id}>
                        <Td className="font-medium">{sku.name}</Td>
                        <Td className="font-mono text-xs">{sku.code}</Td>
                        <Td>
                          <Badge
                            tone={sku.status === 'active' ? 'success' : 'neutral'}
                          >
                            {sku.status}
                          </Badge>
                        </Td>
                        <Td className="text-right tabular-nums font-medium">
                          {skuTotals.get(sku.name) ?? 0}
                        </Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </TableWrap>
          </CardBody>
        </Card>
      </div>

      {/* Add BA form */}
      {elevated && campaign.status === 'active' ? (
        <Card className="mt-6">
          <CardHeader
            title="Assign a BA"
            description="Add a brand ambassador to this campaign."
          />
          <CardBody>
            <form action={addBaToCampaignAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="campaign_id" value={id} />
              <div className="min-w-[200px] flex-1">
                <Label htmlFor="add-ba">Brand Ambassador</Label>
                <Select id="add-ba" name="ba_id" required>
                  <option value="">Select a BA…</option>
                  {(bas ?? [])
                    .filter((ba) => !assignedBaIds.has(ba.id))
                    .map((ba) => (
                      <option key={ba.id} value={ba.id}>
                        {ba.full_name}
                      </option>
                    ))}
                </Select>
              </div>
              <div className="min-w-[200px] flex-1">
                <Label htmlFor="add-store">Store</Label>
                <Select id="add-store" name="store_id">
                  <option value="">Not applicable</option>
                  {(stores ?? []).map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="min-w-[160px]">
                <Label htmlFor="add-start">Effective from</Label>
                <Input id="add-start" name="start_date" type="date" required />
              </div>
              <Button type="submit" size="md">
                Assign
              </Button>
            </form>
          </CardBody>
        </Card>
      ) : null}

      {/* Daily logs grouped by date */}
      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-ink">
          Daily logs ({logsByDate.size} dates)
        </h2>
        {[...logsByDate.entries()].map(([date, dayLogs]) => {
          const dayUnits = dayLogs.reduce((s, l) => s + l.units, 0);
          const dayPresent = dayLogs.filter(
            (l) => l.attendance_status === 'present',
          ).length;
          const daySick = dayLogs.filter(
            (l) => l.attendance_status === 'sick_leave',
          ).length;
          const dayCompleted = dayLogs.filter(
            (l) => l.status === 'completed',
          ).length;

          return (
            <Card key={date} className="mb-4">
              <CardHeader
                title={date}
                description={`${dayLogs.length} logs · ${dayPresent} present · ${daySick} sick · ${dayCompleted} completed · ${dayUnits} units`}
              />
              <CardBody className="p-0">
                <TableWrap className="rounded-none border-0">
                  <Table>
                    <thead>
                      <tr>
                        <Th>BA</Th>
                        <Th>Store</Th>
                        <Th>Attendance</Th>
                        <Th>Status</Th>
                        <Th className="text-right">Units</Th>
                        <Th>SKU breakdown</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {dayLogs.map((log) => (
                        <tr key={log.id}>
                          <Td>
                            <Link
                              href={`/brand-ambassadors/${log.ba_id}`}
                              className="text-deep underline"
                            >
                              {log.ba_name}
                            </Link>
                          </Td>
                          <Td>{log.store_name}</Td>
                          <Td>
                            <Badge tone={attendanceTone(log.attendance_status)}>
                              {log.attendance_status.replace('_', ' ')}
                            </Badge>
                          </Td>
                          <Td>
                            {log.status === 'completed' ? (
                              <Badge tone="success">completed</Badge>
                            ) : log.status === 'open' ? (
                              <Badge tone="warning">open</Badge>
                            ) : (
                              <Badge tone="neutral">{log.status}</Badge>
                            )}
                            {log.flagged ? (
                              <Badge tone="danger">flagged</Badge>
                            ) : null}
                          </Td>
                          <Td className="text-right tabular-nums font-medium">
                            {log.units}
                          </Td>
                          <Td className="text-xs text-muted">
                            {log.skuBreakdown.size > 0
                              ? [...log.skuBreakdown.entries()]
                                  .map(([name, qty]) => `${name}: ${qty}`)
                                  .join(', ')
                              : '—'}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              </CardBody>
            </Card>
          );
        })}
        {logsByDate.size === 0 ? (
          <p className="text-sm text-muted">No logs recorded for this campaign yet.</p>
        ) : null}
      </div>
    </>
  );
}
