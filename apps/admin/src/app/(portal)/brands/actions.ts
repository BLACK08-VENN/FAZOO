'use server';

import { randomInt } from 'node:crypto';
import { serviceSupabase } from '@fazoo/database';
import { requireStaff } from '@/lib/auth';
import { createBrandSchema, requireInternationalPhone } from '@fazoo/validation';
import { RATE_LIMIT_EXPORT_MAX, RATE_LIMIT_EXPORT_WINDOW_S } from '@fazoo/config';

export type CreateBrandState = {
  error: string | null;
  created?: {
    organization_id: string;
    organization_slug: string;
    admin_email: string;
    admin_password: string;
    access_code: string | null;
    campaign_id: string | null;
    store_id: string | null;
    bas_linked: number;
    assignments_created: number;
  };
};

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#%^&*';
  let out = '';
  for (let i = 0; i < 14; i += 1) {
    out += chars[randomInt(chars.length)];
  }
  return out;
}

export async function createBrandAction(
  _prev: CreateBrandState,
  formData: FormData,
): Promise<CreateBrandState> {
  const { client, profile } = await requireStaff();
  if (profile.role !== 'super_admin') {
    return { error: 'Only super administrators can create brands.' };
  }

  // Rate-limit brand creation (a plaintext password / auth user is written).
  try {
    const limiter = serviceSupabase();
    const { data: allowed } = await limiter.rpc('check_rate_limit', {
      p_key: `create-brand:${profile.id}`,
      p_max: RATE_LIMIT_EXPORT_MAX,
      p_window_seconds: RATE_LIMIT_EXPORT_WINDOW_S,
    });
    if (allowed === false) {
      return { error: 'Too many brand creations. Please try again shortly.' };
    }
  } catch {
    return { error: 'Could not verify the request limit. Please try again shortly.' };
  }

  const parsed = createBrandSchema.safeParse({
    name: formData.get('name'),
    slug: formData.get('slug'),
    timezone: formData.get('timezone') || undefined,
    access_code: formData.get('access_code') || '',
    admin_name: formData.get('admin_name'),
    admin_email: formData.get('admin_email'),
    admin_phone: formData.get('admin_phone'),
    campaign_name: formData.get('campaign_name'),
    campaign_start: formData.get('campaign_start'),
    campaign_end: formData.get('campaign_end') || '',
    store_name: formData.get('store_name') || '',
    store_address: formData.get('store_address') || '',
    store_lat: formData.get('store_lat') || '',
    store_lng: formData.get('store_lng') || '',
    store_radius: formData.get('store_radius') || undefined,
    weekly_off_day: Number(formData.get('weekly_off_day') ?? 0),
    ba_ids: formData.getAll('ba_ids'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }
  const v = parsed.data;

  let adminPhone: string;
  try {
    adminPhone = requireInternationalPhone(v.admin_phone);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Enter a valid admin phone.' };
  }

  // 1. Create the brand admin auth user (never possible in SQL). Provide a
  //    phone + the caller's org slug so handle_new_user() passes its E.164
  //    check; the create_brand RPC re-points the profile to the new brand.
  let brandAdminId: string;
  const adminPassword = generatePassword();
  try {
    const admin = await serviceSupabase().auth.admin.createUser({
      email: v.admin_email.trim(),
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        full_name: v.admin_name,
        phone: adminPhone,
        // handle_new_user defaults the transient profile to the first org's
        // slug; create_brand() re-points it to the new brand afterwards.
        organization_slug: 'lenovo-nigeria',
      },
    });
    if (admin.error || !admin.data?.user?.id) {
      return { error: admin.error?.message ?? 'Could not create brand admin account.' };
    }
    brandAdminId = admin.data.user.id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not create brand admin account.' };
  }

  // 2. Create the organization + campaign + memberships via the audited RPC
  //    (run as the signed-in user so auth.uid() = caller inside the function).
  let storeLat: number | null = null;
  let storeLng: number | null = null;
  if (v.store_name && v.store_name !== '' && v.store_lat && v.store_lng) {
    storeLat = Number(v.store_lat);
    storeLng = Number(v.store_lng);
  }

  const { data, error } = await client.rpc('create_brand', {
    p_name: v.name,
    p_slug: v.slug,
    p_timezone: v.timezone || 'Africa/Lagos',
    p_access_code: v.access_code && v.access_code !== '' ? v.access_code : null,
    p_brand_admin_user_id: brandAdminId,
    p_campaign_name: v.campaign_name,
    p_campaign_start: v.campaign_start,
    p_campaign_end: v.campaign_end && v.campaign_end !== '' ? v.campaign_end : null,
    p_store_name: v.store_name && v.store_name !== '' ? v.store_name : null,
    p_store_address: v.store_address && v.store_address !== '' ? v.store_address : null,
    p_store_lat: storeLat,
    p_store_lng: storeLng,
    p_store_radius: v.store_radius ?? 200,
    p_ba_user_ids: v.ba_ids,
    p_weekly_off_day: v.weekly_off_day,
  });

  if (error || !data) {
    await serviceSupabase().auth.admin.deleteUser(brandAdminId);
    return { error: error?.message ?? 'Could not create the brand.' };
  }
  const result = data as Record<string, unknown>;

  return {
    error: null,
    created: {
      organization_id: String(result.organization_id),
      organization_slug: String(result.organization_slug),
      admin_email: v.admin_email.trim(),
      admin_password: adminPassword,
      access_code: result.access_code ? String(result.access_code) : null,
      campaign_id: result.campaign_id ? String(result.campaign_id) : null,
      store_id: result.store_id ? String(result.store_id) : null,
      bas_linked: Number(result.bas_linked ?? 0),
      assignments_created: Number(result.assignments_created ?? 0),
    },
  };
}
