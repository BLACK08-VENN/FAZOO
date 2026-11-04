'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { campaignRequestSchema } from '@fazoo/validation';
import { requireClient } from '@/lib/client-auth';

export async function requestCampaignAction(formData: FormData): Promise<void> {
  const { client, profile } = await requireClient();
  if (profile.role !== 'client') redirect('/brand');

  const requestId = String(formData.get('client_request_id') ?? '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) {
    redirect('/brand/campaigns/new?error=Refresh%20the%20page%20and%20try%20again.');
  }

  const parsed = campaignRequestSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') || null,
    start_date: formData.get('start_date'),
    end_date: formData.get('end_date') || null,
  });
  if (!parsed.success) {
    redirect(
      '/brand/campaigns/new?error=Check%20the%20campaign%20name%2C%20start%20date%20and%20end%20date.',
    );
  }

  const { error } = await client.rpc('client_create_campaign', {
    p_client_request_id: requestId,
    p_name: parsed.data.name,
    p_description: parsed.data.description ?? undefined,
    p_start_date: parsed.data.start_date,
    p_end_date: parsed.data.end_date ?? undefined,
  });

  if (error) {
    redirect(`/brand/campaigns/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/brand');
  revalidatePath('/brand/campaigns');
  revalidatePath('/campaigns');
  redirect('/brand/campaigns?requested=1');
}
