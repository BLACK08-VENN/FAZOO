import Link from 'next/link';
import type { LogRow } from '@/lib/logs-query';
import { Card } from '@/components/ui/card';

/**
 * Store-activity heat grid. Each store renders one tile colored by its share
 * of the period's visits; the biggest single store drives the scale so one
 * outlier never washes out the rest.
 */
export function StoreHeatmap({ rows }: { rows: LogRow[] }) {
  const byStore = new Map<string, { name: string; id: string; visits: number }>();
  for (const r of rows) {
    const entry = byStore.get(r.store_id) ?? { name: r.store_name, id: r.store_id, visits: 0 };
    entry.visits += 1;
    byStore.set(r.store_id, entry);
  }
  const stores = [...byStore.values()].sort((a, b) => b.visits - a.visits);
  const max = Math.max(1, ...stores.map((s) => s.visits));
  const top = Math.max(8, Math.min(stores.length, 24));

  if (stores.length === 0) return null;

  return (
    <Card className="mt-6">
      <div className="flex items-center justify-between border-b border-ink/8 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">Store activity heat</h2>
          <p className="mt-0.5 text-xs text-muted">
            Top {top} stores by visit count in the selected range. Darker = busier.
          </p>
        </div>
        <div aria-hidden="true" className="hidden items-center gap-2 text-[10px] text-muted sm:flex">
          <span>Quiet</span>
          {[0.15, 0.35, 0.55, 0.75, 0.95].map((op) => (
            <span
              key={op}
              className="size-3 rounded-sm"
              style={{ backgroundColor: `rgba(123, 47, 190, ${op})` }}
            />
          ))}
          <span>Busy</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5 p-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {stores.slice(0, top).map((s) => {
          const intensity = s.visits / max;
          return (
            <Link
              key={s.id}
              href={`/stores/${s.id}`}
              className="group flex min-h-16 flex-col justify-between rounded-lg border border-ink/8 p-3 transition-transform hover:-translate-y-0.5"
              style={{ backgroundColor: `rgba(123, 47, 190, ${0.12 + intensity * 0.88})` }}
            >
              <span className="text-xs font-semibold leading-tight text-ink">{s.name}</span>
              <span className="mt-1 text-sm font-bold tabular-nums text-ink">
                {s.visits} <span className="text-[10px] font-medium text-ink/70">visits</span>
              </span>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}