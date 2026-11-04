'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { ADMIN_WORKSPACE_COOKIE } from '@/lib/admin-workspace';
import { serverSupabase } from '@fazoo/database';
import { requireStaff } from '@/lib/auth';

export async function signOutAction(): Promise<void> {
  const client = await serverSupabase();
  await client.auth.signOut({ scope: 'local' });
  (await cookies()).delete(ADMIN_WORKSPACE_COOKIE);
  redirect('/sign-in');
}

export type OpenBrandState = { error: string | null };

export async function openAdminBrandAction(
  _state: OpenBrandState,
  formData: FormData,
): Promise<OpenBrandState> {
  const { client, profile } = await requireStaff();
  const organizationId = String(formData.get('organization_id') ?? '');
  const requestId = String(formData.get('client_request_id') ?? '');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(organizationId) || !uuid.test(requestId))
    return { error: 'Choose an active brand and try again.' };
  const { error } = await client.rpc('admin_open_brand', {
    p_organization_id: organizationId,
    p_client_request_id: requestId,
  });
  if (error) return { error: error.message };
  (await cookies()).set(ADMIN_WORKSPACE_COOKIE, `${profile.id}:${organizationId}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 8 * 60 * 60,
  });
  revalidatePath('/', 'layout');
  redirect('/workspace');
}

export async function switchAdminBrandAction(formData: FormData): Promise<void> {
  if (!formData.get('client_request_id'))
    formData.set('client_request_id', crypto.randomUUID());
  const result = await openAdminBrandAction({ error: null }, formData);
  if (result.error) throw new Error(result.error);
}
