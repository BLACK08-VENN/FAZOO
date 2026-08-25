import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { supabase } from './supabase';
import { parseRecoveryTokens } from './recovery-parser';

export function useRecoveryLinks(): void {
  const router = useRouter();
  useEffect(() => {
    async function handle(url: string | null) {
      if (!url) return;
      const tokens = parseRecoveryTokens(url);
      if (!tokens) return;
      const { error } = await supabase.auth.setSession({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
      });
      if (!error) router.replace('/update-password');
    }
    void Linking.getInitialURL().then(handle);
    const subscription = Linking.addEventListener('url', ({ url }) => void handle(url));
    return () => subscription.remove();
  }, [router]);
}
