'use server';

import { revalidatePath } from 'next/cache';
import { partnerLogSchema } from '@fazoo/validation';
import type { Json } from '@fazoo/database/database.types';
import { requirePartnerAccess } from '@/lib/partners-server';
import type { PartnerOutlet } from '@/lib/partners';

export async function searchPartners(search: string): Promise<PartnerOutlet[]> {
  const { client } = await requirePartnerAccess();
  const { data, error } = await client.rpc('partner_directory', {
    p_search: String(search).slice(0, 200),
  });
  if (error) throw new Error(error.message);
  return data as unknown as PartnerOutlet[];
}
export async function submitPartnerLog(requestId: string, payload: unknown) {
  const { client, profile } = await requirePartnerAccess();
  if (profile.role !== 'brand_ambassador')
    return { error: 'Only merchandisers may submit logs.' };
  const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    requestId,
  );
  const parsed = partnerLogSchema.safeParse(payload);
  if (!validId || !parsed.success)
    return {
      error: parsed.success
        ? 'Invalid request ID.'
        : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    };
  const { data, error } = await client.rpc('partner_submit_log', {
    p_client_request_id: requestId,
    p_payload: parsed.data as unknown as Json,
  });
  if (error) return { error: error.message };
  revalidatePath('/partners');
  revalidatePath('/brand/partners');
  return { data: data as { id: string; partner_id: string; submitted: boolean } };
}
export async function setPartnerThresholds(requestId: string, high: number, medium: number) {
  const { client, profile } = await requirePartnerAccess();
  if (!['organization_admin', 'super_admin'].includes(profile.role))
    return { error: 'Administrator access required.' };
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId) ||
    !Number.isInteger(high) ||
    !Number.isInteger(medium) ||
    medium < 0 ||
    high <= medium ||
    high > 10000000
  )
    return { error: 'High must exceed medium. Enter nonnegative whole numbers.' };
  const { error } = await client.rpc('partner_set_thresholds', {
    p_client_request_id: requestId,
    p_high: high,
    p_medium: medium,
  });
  if (error) return { error: error.message };
  revalidatePath('/partners');
  revalidatePath('/brand/partners');
  return { success: true };
}
