import { redirect } from 'next/navigation';
import { serverSupabase, type FazooClient } from '@fazoo/database';
import type { AppRole } from '@fazoo/types';

export type AdminProfile = {
  id: string;
  full_name: string;
  phone: string;
  role: AppRole;
  account_status: 'pending' | 'approved' | 'rejected' | 'suspended' | 'inactive';
  organization_id: string;
};

/**
 * Resolve the signed-in staff profile. Redirects to sign-in when
 * unauthenticated and to a "not authorized" screen when the account is not
 * an approved member of staff (BAs use the mobile app).
 */
export async function requireStaff(): Promise<{ client: FazooClient; profile: AdminProfile }> {
  const client = await serverSupabase();
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) redirect('/sign-in');

  const { data: profile } = await client
    .from('profiles')
    .select('id, full_name, phone, role, account_status, organization_id')
    .eq('id', user.id)
    .single();

  if (
    !profile ||
    profile.role === 'brand_ambassador' ||
    profile.account_status !== 'approved'
  ) {
    redirect('/not-authorized');
  }

  return { client, profile: profile as AdminProfile };
}

/** CSV export + other elevated routes additionally verify role server-side. */
export function isElevated(role: AppRole): boolean {
  return role === 'super_admin' || role === 'organization_admin';
}
