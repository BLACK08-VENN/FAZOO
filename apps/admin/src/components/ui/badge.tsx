import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Status badge — always pairs a text label with colour so status is never
 * conveyed by colour alone (accessibility rule).
 */
export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'purple';
  children: ReactNode;
}) {
  const tones = {
    neutral: 'bg-ink/5 text-charcoal border-ink/10',
    success: 'bg-ok/10 text-ok border-ok/30',
    warning: 'bg-warn/10 text-warn border-warn/30',
    danger: 'bg-bad/10 text-bad border-bad/30',
    purple: 'bg-primary/10 text-deep border-primary/25',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        tones[tone],
      )}
      role="status"
    >
      {children}
    </span>
  );
}

export function attendanceTone(status: string): 'success' | 'warning' | 'danger' | 'purple' | 'neutral' {
  switch (status) {
    case 'present':
    case 'completed':
    case 'approved':
      return 'success';
    case 'sick_leave':
    case 'open':
    case 'pending':
      return 'warning';
    case 'absent':
    case 'rejected':
    case 'suspended':
      return 'danger';
    case 'weekly_off':
      return 'purple';
    default:
      return 'neutral';
  }
}

export function completionBadge(status: string): ReactNode {
  if (status === 'completed') return <Badge tone="success">Completed</Badge>;
  if (status === 'open') return <Badge tone="warning">Open</Badge>;
  return <Badge tone="neutral">{status}</Badge>;
}
