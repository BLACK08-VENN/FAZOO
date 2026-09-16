import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';

export function StatCard({
  label,
  value,
  hint,
  delta,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  delta?: number | null;
}) {
  const deltaTone =
    delta === null || delta === undefined || delta === 0
      ? null
      : delta > 0
        ? 'text-ok'
        : 'text-bad';

  return (
    <Card className="min-w-0 p-3.5 sm:p-5">
      <p
        className="break-words text-[11px] font-medium uppercase tracking-wide text-muted sm:text-xs"
        id={`stat-${label.toLowerCase().replace(/\s+/g, '-')}`}
      >
        {label}
      </p>
      <p
        className="mt-2 break-words text-lg font-bold tabular-nums text-ink sm:text-2xl"
        aria-labelledby={`stat-${label.toLowerCase().replace(/\s+/g, '-')}`}
      >
        {value}
      </p>
      {delta !== undefined && delta !== null ? (
        <p className="mt-1 text-xs">
          {deltaTone ? (
            <span className={`font-semibold tabular-nums ${deltaTone}`}>
              {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
            </span>
          ) : (
            <span className="text-muted">0%</span>
          )}
          <span className="text-muted"> vs previous period</span>
        </p>
      ) : null}
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </Card>
  );
}

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col items-stretch justify-between gap-4 sm:mb-6 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm leading-5 text-muted">{description}</p>
        ) : null}
      </div>
      {children ? (
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex sm:flex-wrap [&>*]:min-h-11">
          {children}
        </div>
      ) : null}
    </div>
  );
}
