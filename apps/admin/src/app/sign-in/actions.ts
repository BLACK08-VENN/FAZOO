'use server';

import { redirect } from 'next/navigation';
import { serverSupabase, serviceSupabase } from '@fazoo/database';
import { toAuthEmail } from '@fazoo/validation';
import {
  RATE_LIMIT_SIGNIN_MAX,
  RATE_LIMIT_SIGNIN_WINDOW_S,
} from '@fazoo/config';

export type SignInState = { error: string | null };

/**
 * Staff sign-in. Accepts a mobile number or an email (super admins may use
 * platform accounts). Rate-limited via the check_rate_limit RPC when the
 * service role is configured; otherwise falls back to Supabase's built-in
 * per-IP limits.
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
  let email = identifier.includes('@') ? identifier : null;
  if (!email) {
    try {
      email = toAuthEmail(identifier);
    } catch {
      return { error: 'Enter a valid mobile number or email address.' };
    }
    if (!email) return { error: 'Enter a valid mobile number or email address.' };
  }

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

  redirect(next.startsWith('/') ? next : '/overview');
}
