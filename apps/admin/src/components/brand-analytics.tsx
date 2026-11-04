import Link from 'next/link';
import { cn } from '@/lib/cn';
import type { AttendanceMix, WeekdayPoint } from '@/server/brand-analytics';

export function ProgressBar({
  value,
  className,
  label,
}: {
  value: number;
  className?: string;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted">{label}</span>
          <span className="tabular-nums font-medium text-ink">{clamped}%</span>
        </div>
      ) : null}
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-ink/8"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        aria-label={label ?? 'Progress'}
      >
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

export function campaignStatusTone(
  status: string,
): 'neutral' | 'success' | 'warning' | 'danger' | 'purple' {
  switch (status) {
    case 'active':
      return 'success';
    case 'completed':
      return 'purple';
    case 'pending_approval':
      return 'warning';
    case 'rejected':
    case 'cancelled':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function campaignStatusLabel(status: string): string {
  return status === 'pending_approval'
    ? 'Awaiting approval'
    : status.charAt(0).toUpperCase() + status.slice(1);
}

const MIX_SEGMENTS = [
  { key: 'present', label: 'Present', colour: '#22C55E' },
  { key: 'sickLeave', label: 'Sick leave', colour: '#F59E0B' },
  { key: 'absent', label: 'Absent', colour: '#EF4444' },
  { key: 'weeklyOff', label: 'Weekly off', colour: '#7B2FBE' },
] as const;

export function AttendanceBar({ mix }: { mix: AttendanceMix }) {
  if (mix.total === 0) {
    return <p className="px-1 py-2 text-sm text-muted">No attendance recorded yet.</p>;
  }

  return (
    <div className="space-y-4">
      <div
        className="flex h-4 w-full overflow-hidden rounded-full bg-ink/8"
        role="img"
        aria-label={`Attendance mix: ${MIX_SEGMENTS.map((segment) => `${segment.label} ${mix[`${segment.key}Pct` as const]}%`).join(', ')}`}
      >
        {MIX_SEGMENTS.map((segment) => {
          const pct = mix[`${segment.key}Pct` as const];
          if (pct === 0) return null;
          return (
            <span
              key={segment.key}
              className="h-full"
              style={{ width: `${pct}%`, backgroundColor: segment.colour }}
            />
          );
        })}
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {MIX_SEGMENTS.map((segment) => (
          <div key={segment.key} className="rounded-lg border border-ink/8 px-3 py-2">
            <dt className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
              <span
                aria-hidden="true"
                className="size-2 rounded-full"
                style={{ backgroundColor: segment.colour }}
              />
              {segment.label}
            </dt>
            <dd className="mt-1 text-lg font-bold tabular-nums text-ink">
              {mix[segment.key]}
              <span className="ml-1 text-xs font-medium text-muted">
                {mix[`${segment.key}Pct` as const]}%
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function WeekdayBars({ data }: { data: WeekdayPoint[] }) {
  const max = Math.max(1, ...data.map((point) => point.units));
  return (
    <div className="flex items-end gap-2 px-1 pt-2" role="img" aria-label="Units sold by weekday">
      {data.map((point) => {
        const height = Math.max(4, Math.round((point.units / max) * 100));
        return (
          <div key={point.day} className="flex flex-1 flex-col items-center gap-1.5">
            <span className="text-[10px] font-semibold tabular-nums text-ink">
              {point.units}
            </span>
            <div className="flex h-28 w-full items-end rounded-md bg-ink/[0.03]">
              <div
                className="w-full rounded-md bg-primary/80"
                style={{ height: `${height}%` }}
                title={`${point.day}: ${point.units} units across ${point.visits} visits`}
              />
            </div>
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
              {point.day}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function RankedBars({
  items,
  unit,
  empty,
}: {
  items: Array<{ id: string; label: string; value: number; href?: string; hint?: string }>;
  unit: string;
  empty: string;
}) {
  if (items.length === 0) {
    return <p className="px-1 py-2 text-sm text-muted">{empty}</p>;
  }
  const max = Math.max(1, ...items.map((item) => item.value));

  return (
    <ol className="space-y-3">
      {items.map((item, index) => {
        const pct = Math.round((item.value / max) * 100);
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-medium text-ink">
                <span className="mr-1.5 text-xs tabular-nums text-muted">{index + 1}.</span>
                {item.label}
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                {item.value}
                <span className="ml-1 text-[10px] font-medium text-muted">{unit}</span>
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink/8">
              <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
            </div>
            {item.hint ? <p className="mt-1 text-[11px] text-muted">{item.hint}</p> : null}
          </>
        );

        return (
          <li key={item.id}>
            {item.href ? (
              <Link
                href={item.href}
                className="block rounded-lg px-1 py-0.5 transition-colors hover:bg-lavender/40"
              >
                {body}
              </Link>
            ) : (
              <div className="px-1 py-0.5">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
