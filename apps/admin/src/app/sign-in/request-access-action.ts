'use server';

import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { serviceSupabase } from '@fazoo/database';
import { accessRequestSchema } from '@fazoo/validation';

export type AccessRequestState = { error: string | null; success?: boolean };

export async function requestAccessAction(
  _previous: AccessRequestState,
  formData: FormData,
): Promise<AccessRequestState> {
  if (process.env.ACCESS_REQUESTS_ENABLED !== 'true') {
    return {
      error: 'Access requests are not available here yet. Please contact your administrator.',
    };
  }
  if (String(formData.get('website') ?? '').trim())
    return { error: 'Unable to submit this request.' };
  const parsed = accessRequestSchema.safeParse({
    client_request_id: formData.get('client_request_id'),
    full_name: formData.get('full_name'),
    organization_name: formData.get('organization_name'),
    requested_role: formData.get('requested_role'),
    contact: formData.get('contact'),
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' };

  try {
    const client = serviceSupabase();
    const requestHeaders = await headers();
    const ip = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    for (const [prefix, value, max, seconds] of [
      ['access-ip', ip, 10, 3600],
      ['access-contact', parsed.data.contact, 3, 86400],
    ] as const) {
      const { data, error } = await client.rpc('check_rate_limit', {
        p_key: `${prefix}:${createHash('sha256').update(value).digest('hex')}`,
        p_max: max,
        p_window_seconds: seconds,
      });
      if (error || data !== true)
        return { error: 'Unable to accept another request right now. Please try again later.' };
    }
    // This RPC records an application only. It never creates users or memberships.
    const { data, error } = await client.rpc('submit_access_request', {
      p_client_request_id: parsed.data.client_request_id,
      p_full_name: parsed.data.full_name,
      p_contact: parsed.data.contact,
      p_organization_name: parsed.data.organization_name,
      p_requested_role: parsed.data.requested_role,
    });
    if (
      error ||
      !data ||
      typeof data !== 'object' ||
      Array.isArray(data) ||
      data.status !== 'ok'
    ) {
      return {
        error:
          'Your request could not be saved. Please try again or contact your administrator.',
      };
    }
    return { error: null, success: true };
  } catch {
    return {
      error: 'Access requests are temporarily unavailable. Please contact your administrator.',
    };
  }
}
