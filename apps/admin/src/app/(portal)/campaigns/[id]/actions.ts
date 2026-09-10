'use server';

import { revalidatePath } from 'next/cache';
import { assignmentInputSchema } from '@fazoo/validation';
import { requireStaff, isElevated } from '@/lib/auth';

export async function addBaToCampaignAction(formData: FormData): Promise<void> {
  const { client, profile } = await requireStaff();
  if (!isElevated(profile.role)) return;

  const offDays: number[] = [];
  const parsed = assignmentInputSchema.safeParse({
    brand_ambassador_id: formData.get('ba_id'),
    campaign_id: formData.get('campaign_id'),
    store_id: formData.get('store_id') || '',
    weekly_off_day: offDays,
    start_date: formData.get('start_date'),
    status: 'active',
  });
  if (!parsed.success) return;

  // Generated types mark a required arg non-null; Postgres still accepts NULL
  // here, which is how a storeless BA is attached.
  const storeId = (parsed.data.store_id || null) as string;
  await client.rpc('admin_upsert_assignment', {
    p_brand_ambassador_id: parsed.data.brand_ambassador_id,
    p_campaign_id: parsed.data.campaign_id,
    p_store_id: storeId,
    p_weekly_off_day: offDays,
    p_start_date: parsed.data.start_date,
  });

  revalidatePath(`/campaigns/${parsed.data.campaign_id}`);
}

export async function removeBaFromCampaignAction(formData: FormData): Promise<void> {
  const { client, profile } = await requireStaff();
  if (!isElevated(profile.role)) return;

  const assignmentId = String(formData.get('assignment_id') ?? '');
  const campaignId = String(formData.get('campaign_id') ?? '');
  if (!assignmentId || !campaignId) return;

  await client
    .from('brand_ambassador_assignments')
    .update({ status: 'cancelled', end_date: new Date().toISOString().slice(0, 10) })
    .eq('id', assignmentId);

  revalidatePath(`/campaigns/${campaignId}`);
}
