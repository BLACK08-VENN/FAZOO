import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import { parseLogFilters } from '@/lib/logs-query';
import { PageHeader, StatCard } from '@/components/page';
import { Card } from '@/components/ui/card';
import { EmptyRow, Table, TableWrap, Td, Th } from '@/components/ui/table';

interface StoreRow {
  storeId: string;
  storeName: string;
  units: number;
  baDays: number;
  completed: number;
  noSalesLogs: number;
  skuCounts: Map<string, number>;
  baUnits: Map<string, number>;
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { client } = await requireStaff();
  const params = await searchParams;
  const filters = parseLogFilters(params);
  const { from, to } = { from: filters.from ?? '', to: filters.to ?? '' };

  // Sales joined through daily_logs for the attendance-date range.
  let query = client
    .from('sales_entries')
    .select(`
      quantity,
      skus ( id, name, code ),
      daily_logs!inner ( id, attendance_date, status, store_id, brand_ambassador_id,
        stores ( id, name ),
        profiles ( id, full_name )
      )
    `)
    .order('quantity', { ascending: false })
    .limit(20000);

  if (filters.campaign_id) {
    query = query.eq('daily_logs.campaign_id', filters.campaign_id);
  }

  const [salesRes, logsRes] = await Promise.all([
    query,
    client
      .from('daily_logs')
      .select('id, status, attendance_status, store_id')
      .gte('attendance_date', filters.preset === 'custom' && from ? from : lagosDaysAgo(30))
      .lte('attendance_date', to || undefined)
      .limit(5000),
  ]);

  const sales = (salesRes.data ?? []) as unknown as Array<{
    quantity: number;
    skus: { id: string; name: string; code: string } | null;
    daily_logs: {
      id: string;
      attendance_date: string;
      status: string;
      store_id: string;
      brand_ambassador_id: string;
      stores: { id: string; name: string } | null;
      profiles: { id: string; full_name: string } | null;
    };
  }>;

  const byStore = new Map<string, StoreRow>();
  for (const entry of sales) {
    const log = entry.daily_logs;
    const key = log.store_id;
    const row =
      byStore.get(key) ??
      ({
        storeId: key,
        storeName: log.stores?.name ?? 'Unknown store',
        units: 0,
        baDays: 0,
        completed: 0,
        noSalesLogs: 0,
        skuCounts: new Map(),
        baUnits: new Map(),
      } satisfies StoreRow);

    row.units += entry.quantity;
    if (entry.skus) {
      row.skuCounts.set(
        `${entry.skus.id}::${entry.skus.name}`,
        (row.skuCounts.get(`${entry.skus.id}::${entry.skus.name}`) ?? 0) + entry.quantity,
      );
    }
    row.baUnits.set(
      `${log.profiles?.id}::${log.profiles?.full_name ?? 'Unknown'}`,
      (row.baUnits.get(`${log.profiles?.id}::${log.profiles?.full_name ?? 'Unknown'}`) ?? 0) +
        entry.quantity,
    );
    byStore.set(key, row);
  }

  // Attendance-side stats per store (BA-days, completed, logs with no sales)
  for (const r of logsRes.data ?? []) {
    const row =
      byStore.get(r.store_id) ??
      ({
        storeId: r.store_id,
        storeName: '',
        units: 0,
        baDays: 0,
        completed: 0,
        noSalesLogs: 0,
        skuCounts: new Map(),
        baUnits: new Map(),
      } satisfies StoreRow);
    if (r.attendance_status === 'present') {
      row.baDays += 1;
      if (!sales.some((s) => s.daily_logs.id === r.id)) row.noSalesLogs += 1;
    }
    if (r.status === 'completed') row.completed += 1;
    byStore.set(r.store_id, row);
  }

  const rows = [...byStore.values()].sort((a, b) => b.units - a.units);
  const totalUnits = rows.reduce((s, r) => s + r.units, 0);
  const best = rows[0];
  const activeLowest = [...rows].reverse().find((r) => r.baDays > 0);

  return (
    <>
      <PageHeader
        title="Sales by store"
        description="Where the units are moving — drill into any store."
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total units" value={totalUnits} />
        <StatCard label="Stores with sales" value={rows.filter((r) => r.units > 0).length} />
        <StatCard label="Best store" value={best ? best.storeName : '—'} hint={best ? `${best.units} units` : undefined} />
        <StatCard
          label="Active lowest"
          value={activeLowest ? activeLowest.storeName : '—'}
          hint={activeLowest ? `${activeLowest.units} units` : undefined}
        />
      </div>

      <TableWrap className="mt-6">
        <Table>
          <thead>
            <tr>
              <Th>Store</Th>
              <Th className="text-right">Total units</Th>
              <Th className="text-right">Avg units / BA-day</Th>
              <Th className="text-right">Completed days</Th>
              <Th className="text-right">Attended w/o sales</Th>
              <Th>SKU breakdown</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={6}>No sales in this range.</EmptyRow>
            ) : (
              rows.map((r) => (
                <tr key={r.storeId} className="hover:bg-lavender/60">
                  <Td className="font-medium">{r.storeName}</Td>
                  <Td className="text-right tabular-nums font-semibold">{r.units}</Td>
                  <Td className="text-right tabular-nums">
                    {r.baDays ? (r.units / r.baDays).toFixed(1) : '—'}
                  </Td>
                  <Td className="text-right tabular-nums">{r.completed}</Td>
                  <Td className="text-right tabular-nums">{r.noSalesLogs}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1 text-xs">
                      {[...r.skuCounts.entries()]
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 4)
                        .map(([k, qty]) => (
                          <span key={k} className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-deep">
                            {k.split('::')[1]} × {qty}
                          </span>
                        ))}
                      {r.skuCounts.size > 4 ? (
                        <Link href={`/stores/${r.storeId}`} className="underline">more…</Link>
                      ) : null}
                    </div>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </TableWrap>

      <Card className="mt-6 p-5">
        <h2 className="mb-2 text-sm font-semibold text-ink">About this view</h2>
        <p className="text-sm text-muted">
          Drill down per store for assigned BAs, attendance totals, sick leave and
          photographs on each store&apos;s page. Units always reconcile with the
          underlying sale entries.
        </p>
      </Card>
    </>
  );
}

function lagosDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 86_400_000 + 3_600_000); // shift past Lagos midnight
  return d.toISOString().slice(0, 10);
}
