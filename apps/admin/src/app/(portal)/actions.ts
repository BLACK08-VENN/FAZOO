'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { serverSupabase } from '@fazoo/database';
import { requireStaff } from '@/lib/auth';

export async function signOutAction(): Promise<void> {
  const client = await serverSupabase();
  await client.auth.signOut({ scope: 'local' });
  redirect('/sign-in');
}

export async function switchAdminBrandAction(formData: FormData): Promise<void> {
  const { client, profile } = await requireStaff();
  if (profile.role !== 'super_admin') return;

  const organizationId = String(formData.get('organization_id') ?? '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) return;

  const { data: target } = await client
    .from('organizations')
    .select('id, status')
    .eq('id', organizationId)
    .eq('status', 'active')
    .maybeSingle();

  if (!target) return;

  const { error } = await client
    .from('profiles')
    .update({ organization_id: target.id, current_membership_id: null })
    .eq('id', profile.id);

  if (error) throw new Error(error.message);

  revalidatePath('/', 'layout');
  redirect('/overview');
}
