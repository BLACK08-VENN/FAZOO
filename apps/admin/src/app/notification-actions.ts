'use server';

import { cookies } from 'next/headers';
import { requireApprovedProfile } from '@/lib/auth';
import { ADMIN_WORKSPACE_COOKIE } from '@/lib/admin-workspace';

export async function openUserNotification(id: string, requestId: string) {
  const { client, profile } = await requireApprovedProfile();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(id) || !uuid.test(requestId))
    return { error: 'Choose a notification and try again.' };
  const { data, error } = await client.rpc('notification_open', {
    p_notification_id: id,
    p_client_request_id: requestId,
  });
  if (error) return { error: 'This notification is no longer available for your account.' };
  const result = data as { organization_id: string; web_path: string };
  if (
    !uuid.test(result.organization_id) ||
    !/^\/(overview|workspace|brand|brand-ambassadors|campaigns|leave-requests|daily-logs|partners|booklists|service-desk)(\/|\?|$)/.test(
      result.web_path,
    ) ||
    result.web_path.includes('\\')
  )
    return { error: 'This notification could not be opened.' };
  if (['super_admin', 'organization_admin', 'supervisor'].includes(profile.role)) {
    // Enter the explicitly selected brand before navigating to its protected page.
    const selected = await client.rpc('admin_open_brand', {
      p_organization_id: result.organization_id,
      p_client_request_id: crypto.randomUUID(),
    });
    if (selected.error)
      return { error: 'Your access to this brand has changed. Open it from All brands.' };
    (await cookies()).set(ADMIN_WORKSPACE_COOKIE, `${profile.id}:${result.organization_id}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 8 * 60 * 60,
    });
  }
  return { href: result.web_path };
}
