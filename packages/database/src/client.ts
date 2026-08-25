import { createBrowserClient, createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type FazooClient = SupabaseClient<Database>;

function requireEnv(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

/**
 * Browser client (admin portal client components). Uses the anon key only;
 * every query is subject to RLS.
 */
export function browserSupabase(): FazooClient {
  return createBrowserClient<Database>(
    requireEnv(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv(
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    ),
  );
}

/**
 * Server component / route-handler client bound to the request's cookies so
 * RLS sees the signed-in user. Never use the service role here.
 */
export async function serverSupabase(): Promise<FazooClient> {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  return createServerClient<Database>(
    requireEnv(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv(
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    ),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a server component — middleware refreshes sessions.
          }
        },
      },
    },
  );
}

/**
 * Mobile (Expo) note:
 * The BA app builds its own client in `apps/mobile/src/lib/supabase.ts`
 * because session persistence requires a React Native storage adapter
 * (@react-native-async-storage/async-storage) that must not leak into
 * web bundles.
 */
