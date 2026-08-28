'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { leaveReviewSchema } from '@fazoo/validation';
import { isElevated, requireStaff } from '@/lib/auth';

export async function reviewLeaveRequest(formData: FormData): Promise<void> {
  const { client, profile } = await requireStaff();
  if (!isElevated(profile.role)) redirect('/not-authorized');

  const parsed = leaveReviewSchema.safeParse({
    leave_request_id: formData.get('leave_request_id'),
    decision: formData.get('decision'),
    review_note: formData.get('review_note') || undefined,
  });
  if (!parsed.success) {
    const id = String(formData.get('leave_request_id') ?? '');
    redirect(
      `/leave-requests/${id}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? 'Invalid review')}`,
    );
  }

  const { error } = await client.rpc('admin_review_leave_request', {
    p_leave_request_id: parsed.data.leave_request_id,
    p_decision: parsed.data.decision,
    p_review_note: parsed.data.review_note,
  });
  if (error)
    redirect(
      `/leave-requests/${parsed.data.leave_request_id}?error=${encodeURIComponent(error.message)}`,
    );

  revalidatePath('/leave-requests');
  revalidatePath(`/leave-requests/${parsed.data.leave_request_id}`);
  redirect(`/leave-requests/${parsed.data.leave_request_id}?reviewed=1`);
}
