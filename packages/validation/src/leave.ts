import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');

export const leaveRequestSchema = z
  .object({
    leave_type: z.enum([
      'annual_leave',
      'sick_leave',
      'paternity_leave',
      'maternity_leave',
      'casual_leave',
      'other',
    ]),
    start_date: isoDate,
    end_date: isoDate,
    expected_return_date: isoDate,
    supervisor_informed: z.boolean(),
    supervisor_not_informed_reason: z.string().trim().max(500).optional(),
    reason: z.string().trim().min(5, 'Give a little more detail.').max(2000),
    supporting_document_types: z.array(
      z.enum([
        'medical_report',
        'hospital_card',
        'travel_confirmation',
        'other_supporting_document',
        'not_applicable',
      ]),
    ),
    policy_acknowledged: z.literal(true, {
      error: 'You must acknowledge the leave policy.',
    }),
  })
  .superRefine((value, ctx) => {
    if (value.end_date < value.start_date) {
      ctx.addIssue({
        code: 'custom',
        path: ['end_date'],
        message: 'End date must be on or after the start date.',
      });
    }
    if (value.expected_return_date <= value.end_date) {
      ctx.addIssue({
        code: 'custom',
        path: ['expected_return_date'],
        message: 'Return date must be after the leave ends.',
      });
    }
    if (
      !value.supervisor_informed &&
      (value.supervisor_not_informed_reason?.trim().length ?? 0) < 5
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['supervisor_not_informed_reason'],
        message: 'Explain why your supervisor has not been informed.',
      });
    }
    if (
      value.supporting_document_types.includes('not_applicable') &&
      value.supporting_document_types.length > 1
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['supporting_document_types'],
        message: 'Not applicable cannot be combined with another document.',
      });
    }
  });

export const leaveReviewSchema = z
  .object({
    leave_request_id: z.string().uuid(),
    decision: z.enum(['approve', 'deny']),
    review_note: z.string().trim().max(1000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.decision === 'deny' && (value.review_note?.length ?? 0) < 3) {
      ctx.addIssue({
        code: 'custom',
        path: ['review_note'],
        message: 'A denial reason is required.',
      });
    }
  });

export type LeaveRequestInput = z.infer<typeof leaveRequestSchema>;
