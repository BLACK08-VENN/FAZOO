import { notFound } from 'next/navigation';
import { requireStaff, isElevated } from '@/lib/auth';
import { PageHeader, StatCard } from '@/components/page';
import { Badge, attendanceTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyRow, Table, TableWrap, Td, Th } from '@/components/ui/table';
import { weeklyOffDayName } from '@fazoo/config';
import { deleteBaAction } from '../actions';

export default async function BADetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { client, profile: actor } = await requireStaff();
  const { id } = await params;
  const { error } = await searchParams;
  const elevated = isElevated(actor.role);

  const [{ data: profile }, { data: assignments }] = await Promise.all([
    client.from('profiles').select('*').eq('id', id).single(),
    client
      .from('brand_ambassador_assignments')
      .select(
        `
        *, campaigns ( name ), stores ( name )
      `,
      )
      .eq('brand_ambassador_id', id)
      .order('start_date', { ascending: false }),
  ]);

  if (!profile) notFound();

  const [{ count: presentDays }, { count: sickDays }, { data: salesAgg }] = await Promise.all([
    client
      .from('daily_logs')
      .select('id', { count: 'exact', head: true })
      .eq('brand_ambassador_id', id)
      .eq('attendance_status', 'present'),
    client
      .from('daily_logs')
      .select('id', { count: 'exact', head: true })
      .eq('brand_ambassador_id', id)
      .eq('attendance_status', 'sick_leave'),
    client
      .from('sales_entries')
      .select('quantity, skus ( name )')
      .in(
        'daily_log_id',
        (
          await client.from('daily_logs').select('id').eq('brand_ambassador_id', id).limit(2000)
        ).data?.map((d) => d.id) ?? ['00000000-0000-0000-0000-000000000000'],
      ),
  ]);

  const totalUnits = (salesAgg ?? []).reduce((s, e) => s + e.quantity, 0);
  const skuBreakdown = new Map<string, number>();
  for (const e of salesAgg ?? []) {
    const name = (e.skus as unknown as { name: string } | null)?.name ?? 'Unknown SKU';
    skuBreakdown.set(name, (skuBreakdown.get(name) ?? 0) + e.quantity);
  }

  return (
    <>
      <PageHeader title={profile.full_name} description={profile.phone} />

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

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Assignment history"
            description="Weekly off-day lives on each assignment."
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
                  </tr>
                </thead>
                <tbody>
                  {(assignments ?? []).length === 0 ? (
                    <EmptyRow colSpan={5}>No assignments yet.</EmptyRow>
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
