import { useCallback, useEffect, useRef, useState } from 'react';
import type { VedaTodayResult } from '@fazoo/types';
import { supabase } from './supabase';
import { readCachedVedaToday, writeCachedVedaToday } from './cache';

/** Server-derived Veda activation state — the single source of truth for the
 *  BA's school-visit dashboard (result of the `veda_today` RPC). */
export function useVedaToday() {
  const [data, setData] = useState<VedaTodayResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const inFlight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (inFlight.current) return inFlight.current;
    const request = (async () => {
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
      void writeCachedVedaToday(today);
    }
    setLoading(false);
    })().finally(() => { inFlight.current = null; });
    inFlight.current = request;
    return request;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void readCachedVedaToday().then((cached) => {
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
