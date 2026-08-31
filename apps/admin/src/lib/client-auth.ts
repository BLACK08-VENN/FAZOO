import { redirect } from 'next/navigation';
import { serverSupabase, type FazooClient } from '@fazoo/database';
import type { AppRole } from '@fazoo/types';

export type ClientProfile = {
  id: string;
  full_name: string;
  phone: string;
  role: AppRole;
  account_status: 'pending' | 'approved' | 'rejected' | 'suspended' | 'inactive';
  organization_id: string;
};

export type ClientBrand = {
  name: string;
  slug: string;
  logo_url: string | null;
};

/**
 * Resolve a signed-in brand-workspace user (approved client stakeholder or
 * brand ambassador, who gets a read-only view of their OWN activity).
 * Redirects to sign-in when unauthenticated, or to /not-authorized when the
 * account is not approved for the brand workspace.
 */
export async function requireClient(): Promise<{
  client: FazooClient;
  profile: ClientProfile;
  brand: ClientBrand;
}> {
  const supabase = await serverSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/sign-in');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, phone, role, account_status, organization_id')
    .eq('id', user.id)
    .single();

  if (
    !profile ||
    (profile.role !== 'client' && profile.role !== 'brand_ambassador') ||
    profile.account_status !== 'approved'
  ) {
    redirect('/not-authorized');
  }

  const { data: brand } = await supabase
    .from('organizations')
    .select('name, slug, logo_url')
    .eq('id', profile.organization_id)
    .single();

  if (!brand) redirect('/not-authorized');

  return {
    client: supabase,
    profile: profile as ClientProfile,
    brand: brand as ClientBrand,
  };
}
