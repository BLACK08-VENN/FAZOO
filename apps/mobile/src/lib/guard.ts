import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { supabase } from './supabase';
import { routeRedirect, type AccountStatus } from './routing';

/**
 * Route guard: pending/rejected/suspended users never reach operational
 * screens; signed-in users skip auth screens. Server-side rules still apply
 * (RLS + RPC guards) — this is UX, not security.
 *
 * The global loader only shows on cold start. After the first successful
 * check the UI stays mounted and redirects happen without flashing a
 * full-screen spinner, which otherwise causes a visible loop ("blink")
 * right after login as Supabase emits auth/token events.
 */
export function useRouteGuard(): { ready: boolean } {
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const init = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function check(isRecovery = false) {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      let status: AccountStatus | undefined;
      if (session && !isRecovery) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('account_status')
          .single();
        status = profile?.account_status as AccountStatus | undefined;
      }
      const redirect = routeRedirect(pathname, Boolean(session), status, isRecovery);
      if (redirect && redirect !== pathname) {
        router.replace(redirect);
        return;
      }

      if (!cancelled) {
        init.current = true;
        setReady(true);
      }
    }

    // Flash the cold-start loader only once; subsequent runs are silent.
    if (!init.current) setReady(false);
    void check();
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      void check(event === 'PASSWORD_RECOVERY');
      if (event === 'PASSWORD_RECOVERY') router.replace('/update-password');
    });
    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [pathname, router]);

  return { ready };
}
