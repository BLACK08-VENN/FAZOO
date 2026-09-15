'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireStaff, isElevated } from '@/lib/auth';

export async function deleteDailyLogAction(formData: FormData): Promise<{ error: string } | void> {
  const { client, profile } = await requireStaff();
  if (!isElevated(profile.role)) return { error: 'Only admins can delete daily logs.' };

  const id = String(formData.get('log_id') ?? '');
  const requestId = String(formData.get('client_request_id') ?? '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)
    || formData.get('confirmation') !== 'DELETE') {
    return { error: 'Confirm the deletion and try again.' };
  }

  const { error } = await client.rpc('admin_delete_daily_log', {
    p_daily_log_id: id,
    p_client_request_id: requestId,
  });
  if (error) return { error: error.message };

  revalidatePath('/daily-logs');
  revalidatePath('/reports');
  revalidatePath('/overview');
  redirect('/daily-logs?deleted=1');
}
