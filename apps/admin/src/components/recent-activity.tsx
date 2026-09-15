import Link from 'next/link';
import type { FazooClient } from '@fazoo/database';
import { formatLagosDisplay } from '@fazoo/config';
import { Card } from '@/components/ui/card';

const ACTION_LABELS: Record<string, string> = {
  'daily_log.delete': 'Deleted a daily log',
  'ba.account.approved': 'Approved a brand ambassador',
  'ba.account.rejected': 'Rejected a brand ambassador',
};

function humanize(action: string): string {
  const known = ACTION_LABELS[action];
  if (known) return known;
  return action
    .replace(/^booklist_/, '')
    .replace(/^admin_/, '')
    .replace(/[._]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function RecentActivity({ client, limit = 8 }: { client: FazooClient; limit?: number }) {
  const { data: logs } = await client
    .from('audit_logs')
    .select('id, action, entity_type, created_at, profiles ( full_name )')
    .order('created_at', { ascending: false })
    .limit(limit);

  if ((logs ?? []).length === 0) return null;

  return (
    <Card className="mt-6">
      <div className="flex items-center justify-between border-b border-ink/8 px-5 py-4">
        <h2 className="text-sm font-semibold text-ink">Recent activity</h2>
        <Link href="/audit-logs" className="text-xs font-medium text-primary hover:underline">
          View full audit log
        </Link>
      </div>
      <ul className="divide-y divide-ink/[0.06]">
        {(logs ?? []).map((l) => (
          <li key={l.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
            <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-ink">{humanize(l.action)}</span>
            <span className="shrink-0 text-muted">
              {l.profiles?.full_name ?? 'system'}
              {' · '}
              {formatLagosDisplay(l.created_at).split(', ').slice(0, 2).join(', ')}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}