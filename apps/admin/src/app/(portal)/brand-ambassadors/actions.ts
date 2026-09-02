'use server';

import { randomInt } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { serviceSupabase } from '@fazoo/database';
import { requireStaff, isElevated } from '@/lib/auth';
import {
  createBaInputSchema,
  deleteBaSchema,
  requireInternationalPhone,
  phoneToAuthEmail,
} from '@fazoo/validation';
import { RATE_LIMIT_EXPORT_MAX, RATE_LIMIT_EXPORT_WINDOW_S } from '@fazoo/config';

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#%^&*';
  let out = '';
  for (let i = 0; i < 14; i += 1) {
    out += chars[randomInt(chars.length)];
  }
  return out;
}

export type AddBaState = {
  error: string | null;
  created?: {
    full_name: string;
    phone: string;
    password: string;
  };
};

export async function addBaAction(_prev: AddBaState, formData: FormData): Promise<AddBaState> {
  const { client, profile } = await requireStaff();
  if (!isElevated(profile.role)) {
    return { error: 'Not permitted.' };
  }

  try {
    const limiter = serviceSupabase();
    const { data: allowed } = await limiter.rpc('check_rate_limit', {
      p_key: `create-ba:${profile.id}`,
      p_max: RATE_LIMIT_EXPORT_MAX,
      p_window_seconds: RATE_LIMIT_EXPORT_WINDOW_S,
    });
    if (allowed === false) {
      return { error: 'Too many BA creations. Please try again shortly.' };
    }
  } catch {
    return { error: 'Could not verify the request limit. Please try again shortly.' };
  }

  const endRaw = String(formData.get('end_date') ?? '');
  const parsed = createBaInputSchema.safeParse({
    full_name: formData.get('full_name'),
    phone: formData.get('phone'),
    campaign_id: formData.get('campaign_id'),
    store_id: formData.get('store_id'),
    weekly_off_day: Number(formData.get('weekly_off_day') ?? 0),
    start_date: formData.get('start_date'),
    end_date: endRaw && endRaw !== '' ? endRaw : undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }
  const v = parsed.data;

  let e164: string;
  try {
    e164 = requireInternationalPhone(v.phone);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Enter a valid BA mobile number.' };
  }

  // 1. Create the auth identity (never possible in SQL). handle_new_user()
  //    drops a temp profile from the metadata; admin_create_ba re-points it to
  //    the acting admin's org and provisions the membership + assignment.
  const password = generatePassword();
  let baUserId: string;
  try {
    const { data: org } = await client
      .from('organizations')
      .select('slug')
      .eq('id', profile.organization_id)
      .single();
    const created = await serviceSupabase().auth.admin.createUser({
      email: phoneToAuthEmail(e164),
      password,
      email_confirm: true,
      user_metadata: {
        full_name: v.full_name,
        phone: e164,
        organization_slug: org?.slug ?? undefined,
      },
    });
    if (created.error || !created.data?.user?.id) {
      return { error: created.error?.message ?? 'Could not create the BA account.' };
    }
    baUserId = created.data.user.id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not create the BA account.' };
  }

  // 2. Provision the membership + assignment via the audited RPC.
  const { error } = await client.rpc('admin_create_ba', {
    p_user_id: baUserId,
    p_campaign_id: v.campaign_id,
    p_store_id: v.store_id,
    p_weekly_off_day: v.weekly_off_day,
    p_start_date: v.start_date,
    p_end_date: v.end_date && v.end_date !== '' ? v.end_date : undefined,
  });
  if (error) {
    await serviceSupabase().auth.admin.deleteUser(baUserId);
    return { error: error.message };
  }

  revalidatePath('/brand-ambassadors');
  return {
    error: null,
    created: { full_name: v.full_name, phone: e164, password },
  };
}

export async function deleteBaAction(formData: FormData): Promise<void> {
  const { client, profile } = await requireStaff();
  if (!isElevated(profile.role)) redirect('/not-authorized');

  const parsed = deleteBaSchema.safeParse({
    profile_id: formData.get('profile_id'),
  });
  if (!parsed.success) {
    const id = String(formData.get('profile_id') ?? '');
    redirect(`/brand-ambassadors/${id}?error=${encodeURIComponent('Invalid request.')}`);
  }

  // Remove the audited profile (cascades assignments, logs, sales, leaves).
  const { error } = await client.rpc('admin_delete_ba', {
    p_profile_id: parsed.data.profile_id,
  });
  if (error) {
    redirect(
      `/brand-ambassadors/${parsed.data.profile_id}?error=${encodeURIComponent(error.message)}`,
    );
  }

  // Remove the underlying auth identity so the login + memberships are gone too.
  await serviceSupabase().auth.admin.deleteUser(parsed.data.profile_id);

  revalidatePath('/brand-ambassadors');
  redirect('/brand-ambassadors');
}
