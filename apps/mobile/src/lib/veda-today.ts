import { useEffect, useState } from 'react';
import type { VedaTodayResult } from '@fazoo/types';
import { supabase } from './supabase';
import { readCachedVedaToday, writeCachedVedaToday } from './cache';

/** Server-derived Veda activation state — the single source of truth for the
 *  BA's school-visit dashboard (result of the `veda_today` RPC). */
export function useVedaToday() {
  const [data, setData] = useState<VedaTodayResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    setError(null);
    const { data: result, error: err } = await supabase.rpc('veda_today');
    if (err) {
      const cached = await readCachedVedaToday();
      if (cached) {
        setData(cached);
        setError('Offline — showing the most recently synced visit.');
      } else setError(err.message);
    } else {
      const today = result as unknown as VedaTodayResult;
      setData(today);
      await writeCachedVedaToday(today);
    }
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, []);

  return { data, loading, error, refresh };
}