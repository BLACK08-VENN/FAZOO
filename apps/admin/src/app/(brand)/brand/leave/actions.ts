'use server';

import { revalidatePath } from 'next/cache';
import { leaveRequestSchema } from '@fazoo/validation';
import { requireClient } from '@/lib/client-auth';

export type LeaveFormState = {
  error: string | null;
  success: string | null;
};

export async function submitLeaveRequest(
  _previous: LeaveFormState,
  formData: FormData,
): Promise<LeaveFormState> {
  const { client, profile } = await requireClient();

  if (profile.role !== 'brand_ambassador') {
    return { error: 'Only brand ambassadors can apply for leave.', success: null };
  }

  const assignmentId = String(formData.get('assignment_id') ?? '');
  if (!assignmentId) {
    return { error: 'Choose the assignment this leave request is for.', success: null };
  }

  const parsed = leaveRequestSchema.safeParse({
    leave_type: formData.get('leave_type'),
    start_date: formData.get('start_date'),
    end_date: formData.get('end_date'),
    expected_return_date: formData.get('expected_return_date'),
    supervisor_informed: formData.get('supervisor_informed') === 'on',
    supervisor_not_informed_reason:
      String(formData.get('supervisor_not_informed_reason') ?? '').trim() || undefined,
    reason: formData.get('reason'),
    supporting_document_types: formData.getAll('supporting_document_types'),
    policy_acknowledged: formData.get('policy_acknowledged') === 'on',
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? 'Check the form and try again.',
      success: null,
    };
  }

  const { error } = await client.rpc('ba_submit_leave_request', {
    p_assignment_id: assignmentId,
    p_leave_type: parsed.data.leave_type,
    p_start_date: parsed.data.start_date,
    p_end_date: parsed.data.end_date,
    p_expected_return_date: parsed.data.expected_return_date,
    p_supervisor_informed: parsed.data.supervisor_informed,
    p_supervisor_not_informed_reason: parsed.data.supervisor_not_informed_reason ?? '',
    p_reason: parsed.data.reason,
    p_supporting_document_types: parsed.data.supporting_document_types,
    p_policy_acknowledged: parsed.data.policy_acknowledged,
    p_client_request_id: crypto.randomUUID(),
  });

  if (error) return { error: error.message, success: null };

  revalidatePath('/brand/leave');
  return { error: null, success: 'Leave request sent for admin review.' };
}
