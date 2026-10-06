'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { weeklyOffDaysSchema } from '@fazoo/validation';
import { requireStaff, isElevated } from '@/lib/auth';

export async function editBaAssignmentAction(formData: FormData): Promise<void> {
  const { client, profile } = await requireStaff();
  if (!isElevated(profile.role)) throw new Error('Not permitted.');
  const assignmentId = String(formData.get('assignment_id') ?? '');
  const storeId = String(formData.get('store_id') ?? '');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const offDays = weeklyOffDaysSchema.safeParse([...new Set(formData.getAll('weekly_off_day').map(Number))]);
  if (!uuid.test(assignmentId) || (storeId && !uuid.test(storeId)) || !offDays.success) {
    throw new Error('Select a valid store and up to four off days.');
  }
  const { data: assignment } = await client.from('brand_ambassador_assignments')
    .select('*').eq('id', assignmentId)
    .eq('organization_id', profile.organization_id).single();
  if (!assignment) throw new Error('Assignment not found in this brand.');
  const path = `/brand-ambassadors/${assignment.brand_ambassador_id}`;
  const fail = (message: string): never => redirect(`${path}?error=${encodeURIComponent(message)}`);
  if (storeId) {
    const { data: store } = await client.from('stores').select('id')
      .eq('id', storeId).eq('organization_id', assignment.organization_id)
      .eq('status', 'active').single();
    if (!store) fail('Choose an active store in this brand.');
  }
  const { error } = await client.rpc('admin_upsert_assignment', {
    p_assignment_id: assignment.id,
    p_brand_ambassador_id: assignment.brand_ambassador_id,
    p_campaign_id: assignment.campaign_id,
    p_store_id: (storeId || null) as string,
    p_weekly_off_day: offDays.data,
    p_start_date: assignment.start_date,
    p_end_date: assignment.end_date ?? undefined,
    p_status: assignment.status,
  });
  if (error) fail(error.message);
  revalidatePath(path);
  revalidatePath('/brand-ambassadors');
  revalidatePath(`/campaigns/${assignment.campaign_id}`);
  revalidatePath('/brand');
  redirect(`${path}?saved=1`);
}
