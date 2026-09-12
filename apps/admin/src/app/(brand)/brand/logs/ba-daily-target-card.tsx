'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { browserSupabase } from '@fazoo/database/browser';
import type { BaVisitStatsResult } from '@fazoo/types';
import { AgencyBadge } from '@/components/stage-badge';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

export function BaDailyTargetCard() {
  const client = useMemo(() => browserSupabase(), []);
  const [stats, setStats] = useState<BaVisitStatsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { data, error: statsError } = await client.rpc('ba_visit_stats');
    if (statsError) {
      setError(statsError.message);
      return;
    }
    setStats(data as unknown as BaVisitStatsResult);
    setError(null);
  }, [client]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  const visited = stats?.schools_visited_today ?? 0;
  const target = stats?.target_daily_schools ?? null;
  const met = target !== null && visited >= target;
  const remaining = target === null ? null : Math.max(target - visited, 0);
  const progress = target && target > 0 ? Math.min(100, Math.round((visited / target) * 100)) : target === 0 ? 100 : 0;

  return (
    <Card className="mb-5 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Today</p>
          <h2 className="mt-1 text-base font-semibold text-ink">School target</h2>
        </div>
        <AgencyBadge agency={stats?.agency} selfieRequired={stats?.selfie_required} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-ink/10 p-3">
          <p className="text-xs text-muted">Schools reached today</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{visited}</p>
        </div>
        <div className="rounded-xl border border-ink/10 p-3">
          <p className="text-xs text-muted">Daily target</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{target ?? '—'}</p>
          <p className="text-xs text-muted">{target === null ? 'Not mandatory' : 'distinct schools'}</p>
        </div>
        <div className="col-span-2 rounded-xl border border-ink/10 p-3 sm:col-span-1">
          <p className="text-xs text-muted">Status</p>
          <div className="mt-2">
            {target === null ? (
              <Badge tone="neutral">No mandatory target</Badge>
            ) : met ? (
              <Badge tone="success">Target met today</Badge>
            ) : (
              <Badge tone="warning">{remaining} school{remaining === 1 ? '' : 's'} remaining</Badge>
            )}
          </div>
        </div>
      </div>

      {target !== null ? (
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-ink/10" aria-hidden="true">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted">
            {visited} of {target} distinct schools today. Visiting the same school more than once does not increase the target count.
          </p>
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted">
          This BA can still log schools normally, but no compulsory daily school target is applied.
        </p>
      )}

      {error ? <p className="mt-3 text-xs font-medium text-bad">Target status could not refresh: {error}</p> : null}
    </Card>
  );
}
