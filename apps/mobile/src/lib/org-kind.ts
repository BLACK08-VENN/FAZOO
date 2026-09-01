import { useEffect, useState } from 'react';
import type { OrganizationKind } from '@fazoo/types';
import { supabase } from './supabase';
import { readCachedOrgKind, writeCachedOrgKind } from './cache';

/** The current organization's kind ('retail' | 'schools'), derived server-side
 *  from the active profile — the client picks the BA flow with it. */
export function useOrgKind() {
  const [kind, setKind] = useState<OrganizationKind | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data, error } = await supabase.rpc('current_user_org_kind');
      if (error) {
        const cached = await readCachedOrgKind();
        if (cached && !cancelled) setKind(cached);
      } else {
        const next = (data as OrganizationKind | null) ?? 'retail';
        if (!cancelled) setKind(next);
        await writeCachedOrgKind(next);
      }
      if (!cancelled) setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { kind, loading };
}