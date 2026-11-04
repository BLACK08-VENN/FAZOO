'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireStaff } from '@/lib/auth';

export async function reviewCampaignAction(formData: FormData): Promise<void> {
  const { client, profile } = await requireStaff();
  if (profile.role !== 'super_admin' && profile.role !== 'organization_admin') return;

  const campaignId = String(formData.get('campaign_id') ?? '').trim();
  const decision = String(formData.get('decision') ?? '').trim();
  const requestId = String(formData.get('client_request_id') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();

  if (!/^[0-9a-f-]{36}$/i.test(campaignId)) return;
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return;
  if (decision !== 'approve' && decision !== 'reject') return;

  const { error } = await client.rpc('admin_review_campaign', {
    p_client_request_id: requestId,
    p_campaign_id: campaignId,
    p_decision: decision,
    p_note: note || undefined,
  });

  if (error) {
    redirect(`/campaigns?review=error&reason=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/campaigns');
  revalidatePath('/overview');
  revalidatePath('/brand');
  revalidatePath('/brand/campaigns');
  redirect('/campaigns?review=ok');
}
