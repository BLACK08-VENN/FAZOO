'use server';

import { serverSupabase, serviceSupabase } from '@fazoo/database';
import { toAuthEmail } from '@fazoo/validation';
import {
  RATE_LIMIT_SIGNIN_MAX,
  RATE_LIMIT_SIGNIN_WINDOW_S,
} from '@fazoo/config';

export type SignInState = { error: string | null; redirectTo?: string };

/**
 * Portal sign-in with an account-type selector (role tab).
 *
 *   • Admin      – email + password (super_admin / organization_admin / supervisor)
 *   • BA         – phone + password (brand_ambassador)
 *   • Brand      – phone + password (client)
 *
 * Phone numbers map to the internal email alias (<digits>@ba.fazoo.app).
 * Rate-limited via the check_rate_limit RPC when the service role is
 * configured; otherwise falls back to Supabase's built-in per-IP limits.
 *
 * Returns a redirectTo URL on success instead of calling redirect() so the
 * client component can navigate via router.push — avoids a Next.js 16
 * useActionState / redirect() interaction that leaves the form pending.
 */
export async function signInAction(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  // Selected role tab: 'admin' (email), 'ba' (phone), 'brand' (phone).
  const role = String(formData.get('role') ?? 'admin') as 'admin' | 'ba' | 'brand';
  const identifier = String(formData.get('identifier') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/overview');

  if (!identifier || !password) {
    return { error: 'Enter your identifier and password.' };
  }

  // Admins sign in with email; brand ambassadors and brands/clients sign in
  // with a phone number that maps to their internal email alias
  // (<digits>@ba.fazoo.app).
  let email: string | null;
  if (role === 'admin') {
    if (!identifier.includes('@')) {
      return { error: 'Sign in to the admin portal with your email address.' };
    }
    email = identifier;
  } else {
    if (identifier.includes('@')) {
      return { error: 'Sign in with your phone number, not an email address.' };
    }
    try {
      email = toAuthEmail(identifier);
    } catch {
      return { error: 'Enter a valid phone number (e.g. 0801 234 5678).' };
    }
    if (!email) return { error: 'Enter a valid phone number (e.g. 0801 234 5678).' };
  }

  const expectedRoles =
    role === 'admin'
      ? ['super_admin', 'organization_admin', 'supervisor']
      : role === 'brand'
        ? ['client']
        : ['brand_ambassador'];

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

    // Determine redirect based on role, and confirm the account belongs to
    // the selected login tab.
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
        if (!profile?.role || !expectedRoles.includes(profile.role)) {
          await client.auth.signOut();
          return {
            error: 'This account is not set up for the selected login. Choose the right one.',
          };
        }
        if (profile.role === 'client' || profile.role === 'brand_ambassador') {
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
