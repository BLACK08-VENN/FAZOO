'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { assignmentInputSchema } from '@fazoo/validation';
import { requireStaff, isElevated } from '@/lib/auth';

export async function addBaToCampaignAction(formData: FormData): Promise<void> {
  const { client, profile } = await requireStaff();
  if (!isElevated(profile.role)) return;

  const offDays = [...new Set(formData.getAll('weekly_off_day').map(Number))];
  const parsed = assignmentInputSchema.safeParse({
    brand_ambassador_id: formData.get('ba_id'),
    campaign_id: formData.get('campaign_id'),
    store_id: formData.get('store_id') || '',
    weekly_off_day: offDays,
    start_date: formData.get('start_date'),
    status: 'active',
  });
  if (!parsed.success) {
    const campaignId = String(formData.get('campaign_id') ?? '');
    if (/^[0-9a-f-]{36}$/i.test(campaignId)) {
      redirect(`/campaigns/${campaignId}?error=${encodeURIComponent('Check the BA, start date and store, and choose up to four valid off days.')}`);
    }
    throw new Error('Invalid assignment.');
  }

  // Generated types mark a required arg non-null; Postgres still accepts NULL
  // here, which is how a storeless BA is attached.
  const storeId = (parsed.data.store_id || null) as string;
  const { error } = await client.rpc('admin_upsert_assignment', {
    p_brand_ambassador_id: parsed.data.brand_ambassador_id,
    p_campaign_id: parsed.data.campaign_id,
    p_store_id: storeId,
    p_weekly_off_day: parsed.data.weekly_off_day,
    p_start_date: parsed.data.start_date,
  });

  if (error) redirect(`/campaigns/${parsed.data.campaign_id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/campaigns/${parsed.data.campaign_id}`);
  revalidatePath(`/brand-ambassadors/${parsed.data.brand_ambassador_id}`);
  revalidatePath('/brand');
  redirect(`/campaigns/${parsed.data.campaign_id}?assigned=1`);
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

export async function toggleStockCountModelAction(formData: FormData): Promise<void> {
  const { client, profile } = await requireStaff();
  if (!isElevated(profile.role)) return;

  const campaignId = String(formData.get('campaign_id') ?? '');
  const enabled = formData.get('enabled') === 'true';
  if (!campaignId) return;

  await client
    .from('campaigns')
    .update({ stock_count_model: enabled } as never)
    .eq('id', campaignId);

  revalidatePath(`/campaigns/${campaignId}`);
}
