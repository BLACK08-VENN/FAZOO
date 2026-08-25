import { useEffect, useState } from 'react';
import type { BaTodayResult } from '@fazoo/types';
import { supabase } from './supabase';
import { readCachedToday, writeCachedToday } from './cache';

/** Server-derived dashboard state — the single source of truth for Today. */
export function useToday() {
  const [data, setData] = useState<BaTodayResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    setError(null);
    const { data: result, error: err } = await supabase.rpc('ba_today');
    if (err) {
      const cached = await readCachedToday();
      if (cached) {
        setData(cached);
        setError('Offline — showing the most recently synced day.');
      } else setError(err.message);
    } else {
      const today = result as unknown as BaTodayResult;
      setData(today);
      await writeCachedToday(today);
    }
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, []);

  return { data, loading, error, refresh };
}
