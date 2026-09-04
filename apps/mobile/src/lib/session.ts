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

    async function refreshProfile() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        if (!cancelled) {
          setProfile(null);
          setLoading(false);
        }
        return;
      }
      const { data: profileData } = await supabase
        .from('profiles')
        .select(
          'id, organization_id, full_name, phone, profile_photo_path, role, account_status',
        )
        .single();
      const nextProfile = (profileData as SessionProfile | null) ?? (await readCachedProfile());
      if (profileData) await writeCachedProfile(profileData as SessionProfile);
      if (!cancelled) {
        setProfile(nextProfile);
        setLoading(false);
      }
    }

    void refreshProfile();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        if (!cancelled) {
          setProfile(null);
          setLoading(false);
        }
        return;
      }

      if (!cancelled) setLoading(true);
      void refreshProfile();
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  return { loading, profile, refresh: () => supabase.from('profiles').select('*').single() };
}

export async function signOut(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  await supabase.auth.signOut();
  if (data.session?.user.id) await clearUserCache(data.session.user.id);
}
