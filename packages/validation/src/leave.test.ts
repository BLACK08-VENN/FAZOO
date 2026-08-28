import { describe, expect, it } from 'vitest';
import { leaveRequestSchema, leaveReviewSchema } from './leave';

const validRequest = {
  leave_type: 'annual_leave' as const,
  start_date: '2027-01-10',
  end_date: '2027-01-12',
  expected_return_date: '2027-01-13',
  supervisor_informed: true,
  supervisor_not_informed_reason: '',
  reason: 'Annual family leave.',
  supporting_document_types: ['not_applicable'] as const,
  policy_acknowledged: true as const,
};

describe('leave request validation', () => {
  it('accepts a complete request', () => {
    expect(leaveRequestSchema.safeParse(validRequest).success).toBe(true);
  });

  it('rejects invalid date order', () => {
    expect(
      leaveRequestSchema.safeParse({ ...validRequest, expected_return_date: '2027-01-12' })
        .success,
    ).toBe(false);
  });

  it('requires an explanation when the supervisor was not informed', () => {
    expect(
      leaveRequestSchema.safeParse({ ...validRequest, supervisor_informed: false }).success,
    ).toBe(false);
  });

  it('requires a denial reason', () => {
    expect(
      leaveReviewSchema.safeParse({ leave_request_id: crypto.randomUUID(), decision: 'deny' })
        .success,
    ).toBe(false);
  });
});
