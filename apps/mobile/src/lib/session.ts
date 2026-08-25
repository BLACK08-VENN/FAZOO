import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { clearUserCache, readCachedProfile, writeCachedProfile } from './cache';

export interface SessionProfile {
  id: string;
  organization_id: string;
  full_name: string;
  phone: string;
  profile_photo_path: string | null;
  role: string;
  account_status: 'pending' | 'approved' | 'rejected' | 'suspended' | 'inactive';
}

export function useSessionProfile() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<SessionProfile | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        if (!cancelled) setLoading(false);
        return;
      }
      await refresh(cancelled);
    }

    async function refresh(wasCancelled: boolean): Promise<void> {
      const { data } = await supabase
        .from('profiles')
        .select(
          'id, organization_id, full_name, phone, profile_photo_path, role, account_status',
        )
        .single();
      const nextProfile = (data as SessionProfile | null) ?? (await readCachedProfile());
      if (data) await writeCachedProfile(data as SessionProfile);
      if (!wasCancelled && !cancelled) {
        setProfile(nextProfile);
        setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { loading, profile, refresh: () => supabase.from('profiles').select('*').single() };
}

export async function signOut(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  await supabase.auth.signOut();
  if (data.session?.user.id) await clearUserCache(data.session.user.id);
}
