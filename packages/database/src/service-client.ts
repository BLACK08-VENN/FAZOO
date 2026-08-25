import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

let cached: SupabaseClient<Database> | null = null;

/**
 * Service-role client — SERVER ONLY (guarded by the `server-only` import).
 * Bypasses RLS. Use exclusively inside role-checked, rate-limited admin
 * route handlers for operations impossible under RLS (e.g. generating
 * password-reset links via auth.admin).
 */
export function serviceSupabase(): SupabaseClient<Database> {
  if (!cached) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        'serviceSupabase requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
      );
    }
    cached = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
