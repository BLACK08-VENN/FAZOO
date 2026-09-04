import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <Card className="p-4 sm:p-5">
      <p
        className="text-xs font-medium uppercase tracking-wide text-muted"
        id={`stat-${label.toLowerCase().replace(/\s+/g, '-')}`}
      >
        {label}
      </p>
      <p
        className="mt-2 text-xl font-bold tabular-nums text-ink sm:text-2xl"
        aria-labelledby={`stat-${label.toLowerCase().replace(/\s+/g, '-')}`}
      >
        {value}
      </p>
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
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {children ? (
        <div className="flex flex-wrap gap-2 [&>*]:min-h-11 [&>*]:flex-1 sm:[&>*]:flex-none">
          {children}
        </div>
      ) : null}
    </div>
  );
}
