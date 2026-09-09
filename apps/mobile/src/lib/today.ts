import { useCallback, useEffect, useRef, useState } from 'react';
import type { BaTodayResult } from '@fazoo/types';
import { supabase } from './supabase';
import { readCachedToday, writeCachedToday } from './cache';

/** Server-derived dashboard state — the single source of truth for Today. */
export function useToday() {
  const [data, setData] = useState<BaTodayResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const inFlight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (inFlight.current) return inFlight.current;
    const request = (async () => {
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
      void writeCachedToday(today);
    }
    setLoading(false);
    })().finally(() => { inFlight.current = null; });
    inFlight.current = request;
    return request;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void readCachedToday().then((cached) => {
      if (cached && !cancelled) {
        setData(cached);
        setLoading(false);
      }
    });
    void refresh();
    return () => { cancelled = true; };
  }, [refresh]);

  return { data, loading, error, refresh };
}
