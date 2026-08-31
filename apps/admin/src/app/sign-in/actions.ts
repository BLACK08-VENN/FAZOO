'use server';

import { serverSupabase, serviceSupabase } from '@fazoo/database';
import { toAuthEmail } from '@fazoo/validation';
import {
  RATE_LIMIT_SIGNIN_MAX,
  RATE_LIMIT_SIGNIN_WINDOW_S,
} from '@fazoo/config';

export type SignInState = { error: string | null; redirectTo?: string };

/**
 * Staff sign-in. Accepts a mobile number or an email (super admins may use
 * platform accounts). Rate-limited via the check_rate_limit RPC when the
 * service role is configured; otherwise falls back to Supabase's built-in
 * per-IP limits.
 *
 * Returns a redirectTo URL on success instead of calling redirect() so the
 * client component can navigate via router.push — avoids a Next.js 16
 * useActionState / redirect() interaction that leaves the form pending.
 */
export async function signInAction(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const identifier = String(formData.get('identifier') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/overview');

  if (!identifier || !password) {
    return { error: 'Enter your mobile number and password.' };
  }

  // Phone-number identity maps to the internal email alias.
  if (identifier.includes('@')) {
    return { error: 'Sign in with your phone number, not an email address.' };
  }
  let email: string | null = null;
  try {
    email = toAuthEmail(identifier);
  } catch {
    return { error: 'Enter a valid phone number (e.g. 0801 234 5678).' };
  }
  if (!email) return { error: 'Enter a valid phone number (e.g. 0801 234 5678).' };

  // Run the actual sign-in in a guarded block: any unhandled server exception
  // would otherwise surface to the client as an opaque Next.js error digest
  // (e.g. "Error: 1186245521"). Never leak credentials or server internals to
  // the client; log non-secret details server-side for diagnostics instead.
  try {
    // Rate limit: fixed-window counter keyed per identifier.
    try {
      const limiter = serviceSupabase();
      const { data: allowed } = await limiter.rpc('check_rate_limit', {
        p_key: `signin:${email}`,
        p_max: RATE_LIMIT_SIGNIN_MAX,
        p_window_seconds: RATE_LIMIT_SIGNIN_WINDOW_S,
      });
      if (allowed === false) {
        return {
          error:
            'Too many sign-in attempts. Please wait a few minutes and try again.',
        };
      }
    } catch {
      // Limiter unavailable (e.g. local dev without service key): continue;
      // Supabase built-in per-IP limits still apply.
    }

    const client = await serverSupabase();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      return { error: 'Invalid credentials. Please try again.' };
    }

    // Determine redirect based on role.
    let redirectTo = next.startsWith('/') ? next : '/overview';
    try {
      const { data } = await client.auth.getUser();
      const userId = data?.user?.id;
      if (userId) {
        const { data: profile } = await client
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .single();
        if (profile?.role === 'client' || profile?.role === 'brand_ambassador') {
          redirectTo = '/brand';
        }
      }
    } catch {
      // Fall back to default redirect.
    }

    return { error: null, redirectTo };
  } catch (cause) {
    // cause may be an Error (Supabase, env, JSON) — never log credentials.
    console.error('[sign-in] action failed', cause);
    return {
      error: 'Something went wrong signing you in. Please try again in a moment.',
    };
  }
}
