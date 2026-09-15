import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import { PageHeader } from '@/components/page';
import { Card, CardBody } from '@/components/ui/card';
import { lagosDate } from '@fazoo/config';

const MONTHS = Array.from({ length: 12 }, (_, i) =>
  new Date(Date.UTC(2026, i, 1)).toLocaleString('en', { month: 'long' }),
);

function monthBounds(month: string): { from: string; to: string } {
  const parts = month.split('-').map(Number);
  const year = parts[0] ?? 2026;
  const mon = parts[1] ?? 1;
  const days = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return {
    from: `${year}-${String(mon).padStart(2, '0')}-01`,
    to: `${year}-${String(mon).padStart(2, '0')}-${String(days).padStart(2, '0')}`,
  };
}

export default async function AttendanceCalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { client } = await requireStaff();
  const params = await searchParams;
  const today = lagosDate();
  const month = /^\d{4}-\d{2}$/.test(params.month ?? '')
    ? params.month!
    : today.slice(0, 7);
  const baId = params.ba_id ?? '';

  const monthParts = month.split('-').map(Number);
  const year = monthParts[0] ?? 2026;
  const mon = monthParts[1] ?? 1;
  const { from, to } = monthBounds(month);
  const firstWeekday = (new Date(Date.UTC(year, mon - 1, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = Number(to.slice(-2));

  const { data: bas } = await client
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'brand_ambassador')
    .order('full_name');

  let query = client
    .from('daily_logs')
    .select('attendance_date, attendance_status, brand_ambassador_id')
    .gte('attendance_date', from)
    .lte('attendance_date', to);
  if (baId) query = query.eq('brand_ambassador_id', baId);

  const { data: logs } = await query;
  const byDay = new Map<string, { logs: number; present: number }>();
  for (const l of logs ?? []) {
    const day = byDay.get(l.attendance_date) ?? { logs: 0, present: 0 };
    day.logs += 1;
    if (l.attendance_status === 'present') day.present += 1;
    byDay.set(l.attendance_date, day);
  }

  const maxLogs = Math.max(1, ...[...byDay.values()].map((d) => d.logs));
  const totalLogs = (logs ?? []).length;

  const cells: Array<{ date: string | null; logs: number }> = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push({ date: null, logs: 0 });
  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = `${month}-${String(day).padStart(2, '0')}`;
    cells.push({ date: iso, logs: byDay.get(iso)?.logs ?? 0 });
  }

  return (
    <>
      <PageHeader
        title="Attendance calendar"
        description="How many visit logs each day attracted, in Nigerian time."
      >
        <form method="get" className="flex flex-wrap gap-2">
          <input type="hidden" name="month" value={month} />
          <select
            name="ba_id"
            aria-label="Filter by brand ambassador"
            className="h-11 rounded-lg border border-ink/15 bg-white px-3 text-sm text-ink"
          >
            <option value="">All brand ambassadors</option>
            {(bas ?? []).map((b) => (
              <option key={b.id} value={b.id} selected={b.id === baId}>
                {b.full_name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="h-11 rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-deep"
          >
            Apply
          </button>
        </form>
      </PageHeader>

      <Card className="mb-6">
        <CardBody className="flex flex-wrap items-center justify-between gap-3 sm:flex-row">
          <div className="flex items-center gap-2">
            <Link
              href={`/attendance-calendar?month=${previousMonth(month)}${baId ? `&ba_id=${baId}` : ''}`}
              className="rounded-lg border border-ink/15 px-3 py-1.5 text-sm text-ink hover:bg-lavender"
            >
              ←
            </Link>
            <h2 className="min-w-32 text-center text-base font-semibold text-ink">
              {MONTHS[mon - 1]} {year}
            </h2>
            <Link
              href={`/attendance-calendar?month=${nextMonth(month)}${baId ? `&ba_id=${baId}` : ''}`}
              className="rounded-lg border border-ink/15 px-3 py-1.5 text-sm text-ink hover:bg-lavender"
            >
              →
            </Link>
          </div>
          <p className="text-sm text-muted">
            {totalLogs} log{totalLogs === 1 ? '' : 's'} across {byDay.size} day{byDay.size === 1 ? '' : 's'}
            {baId ? ' for the selected BA' : ''}
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="overflow-x-auto">
          <div className="grid min-w-[560px] grid-cols-7 gap-1.5">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="text-center text-xs font-semibold uppercase tracking-wider text-muted">
                {d}
              </div>
            ))}
            {cells.map((cell, i) =>
              cell.date === null ? (
                <div key={`empty-${i}`} className="aspect-square rounded-lg bg-transparent" />
              ) : (
                <div
                  key={cell.date}
                  className="relative flex aspect-square flex-col items-center justify-center rounded-lg border border-ink/8 p-1"
                  style={{
                    backgroundColor:
                      cell.logs === 0
                        ? undefined
                        : `rgba(123, 47, 190, ${0.14 + (cell.logs / maxLogs) * 0.86})`,
                  }}
                  title={`${cell.date} — ${cell.logs} log${cell.logs === 1 ? '' : 's'}`}
                >
                  <span
                    className={`text-sm font-semibold tabular-nums ${cell.logs === 0 ? 'text-muted' : 'text-ink'}`}
                  >
                    {Number(cell.date.slice(-2))}
                  </span>
                  {cell.logs > 0 ? (
                    <span className="mt-0.5 text-[10px] font-medium text-ink/80">{cell.logs}</span>
                  ) : null}
                  {cell.date === today ? (
                    <span className="absolute inset-0 rounded-lg ring-2 ring-primary ring-offset-1" aria-hidden="true" />
                  ) : null}
                </div>
              ),
            )}
          </div>
        </CardBody>
      </Card>
    </>
  );
}

function previousMonth(month: string): string {
  const [y = 2026, m = 1] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

function nextMonth(month: string): string {
  const [y = 2026, m = 1] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}