'use server';

import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { serverSupabase, serviceSupabase } from '@fazoo/database';
import { postSignInPath, signInEmail } from '@/lib/auth-routing';
import { RATE_LIMIT_SIGNIN_MAX, RATE_LIMIT_SIGNIN_WINDOW_S } from '@fazoo/config';

export type SignInState = { error: string | null; redirectTo?: string };

/** One sign-in for all roles. Identity and access come from the verified profile.
 * Rate limiting fails closed. Returning a destination avoids pending-form issues
 * caused by redirect() inside useActionState on this Next.js version.
 */
export async function signInAction(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const identifier = String(formData.get('identifier') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/overview');

  if (!identifier || !password) {
    return { error: 'Enter your email or phone number and password.' };
  }
  const email = signInEmail(identifier);
  if (!email) {
    return {
      error:
        'Enter a valid email or phone number. Include your country code for phone numbers.',
    };
  }
  if (password.length > 4096) return { error: 'Invalid credentials. Please try again.' };

  // Run the actual sign-in in a guarded block: any unhandled server exception
  // would otherwise surface to the client as an opaque Next.js error digest
  // (e.g. "Error: 1186245521"). Never leak credentials or server internals to
  // the client; log non-secret details server-side for diagnostics instead.
  try {
    // Limit both source IP and account; hash identifiers in the limiter table.
    try {
      const limiter = serviceSupabase();
      const requestHeaders = await headers();
      const ip = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
      const { data: ipAllowed, error: ipError } = await limiter.rpc('check_rate_limit', {
        p_key: `signin-ip:${createHash('sha256').update(ip).digest('hex')}`,
        p_max: 100,
        p_window_seconds: RATE_LIMIT_SIGNIN_WINDOW_S,
      });
      if (ipError || ipAllowed !== true)
        return { error: 'Too many sign-in attempts. Please try again later.' };
      const { data: allowed, error: limitError } = await limiter.rpc('check_rate_limit', {
        p_key: `signin:${createHash('sha256').update(email.toLowerCase()).digest('hex')}`,
        p_max: RATE_LIMIT_SIGNIN_MAX,
        p_window_seconds: RATE_LIMIT_SIGNIN_WINDOW_S,
      });
      if (limitError || allowed !== true) {
        return {
          error: 'Too many sign-in attempts. Please wait a few minutes and try again.',
        };
      }
    } catch {
      return { error: 'Sign-in is temporarily unavailable. Please try again shortly.' };
    }

    const client = await serverSupabase();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      return { error: 'Invalid credentials. Please try again.' };
    }

    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData.user) {
      await client.auth.signOut({ scope: 'local' });
      return { error: 'We could not verify your session. Please sign in again.' };
    }
    const { data: profile, error: profileError } = await client
      .from('profiles')
      .select('role, account_status')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (profileError) {
      await client.auth.signOut({ scope: 'local' });
      return { error: 'We could not load your workspace. Please try again.' };
    }

    return { error: null, redirectTo: postSignInPath(profile, next) };
  } catch {
    // Do not log credential-bearing provider errors.
    console.error('[sign-in] action failed');
    return {
      error: 'Something went wrong signing you in. Please try again in a moment.',
    };
  }
}
