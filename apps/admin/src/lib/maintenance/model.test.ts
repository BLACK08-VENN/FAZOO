import { describe, expect, it } from 'vitest';
import { lagosDateTimeToUtc } from '@fazoo/config';
import { applyDemo, DEMO_MANAGER, DEMO_TECH, initialDemo } from './demo';
import { jobNumber, allowedUpdate, canReview, canRead, commandSchema } from './model';

describe('Maintenance client rules', () => {
  it('gives sample jobs distinct visible references', () => {
    const jobs = initialDemo().jobs;
    expect(new Set(jobs.map(jobNumber)).size).toBe(jobs.length);
  });
  it('rejects privileged or unknown client fields and invalid descriptions', () => {
    const request = {
      action: 'create',
      title: 'Inspect pump',
      description: 'Pump has lost pressure.',
      location: 'Fictional site',
      priority: 'normal',
    };
    expect(commandSchema.safeParse(request).success).toBe(true);
    expect(
      commandSchema.safeParse({ ...request, organization_id: 'another-org' }).success,
    ).toBe(false);
    expect(commandSchema.safeParse({ ...request, description: 'short' }).success).toBe(false);
  });
  it('enforces the lifecycle and independent approval', () => {
    expect(allowedUpdate('assigned', 'ready_for_review')).toBe(false);
    expect(allowedUpdate('in_progress', 'ready_for_review')).toBe(true);
    expect(allowedUpdate('awaiting_parts', 'ready_for_review')).toBe(false);
    const workspace = initialDemo();
    const job = workspace.jobs[2]!;
    expect(canReview(job, DEMO_TECH)).toBe(false);
    expect(canReview(job, DEMO_MANAGER)).toBe(true);
    expect(canReview({ ...job, assigned_to: DEMO_MANAGER.id }, DEMO_MANAGER)).toBe(false);
    expect(canRead(workspace.jobs[0]!, DEMO_TECH)).toBe(false);
  });
  it('lets the demo approve and reopen using the same boundaries', () => {
    const workspace = initialDemo();
    const job = workspace.jobs[2]!;
    const next = applyDemo(workspace, {
      action: 'reopen',
      job_id: job.id,
      expected_version: 1,
      note: 'Please check this fitting again.',
    });
    expect(next.jobs[2]?.status).toBe('in_progress');
    expect(next.jobs[2]?.version).toBe(2);
    expect(() =>
      applyDemo(
        { ...workspace, viewer: DEMO_TECH },
        {
          action: 'approve',
          job_id: job.id,
          expected_version: 1,
          note: 'Approve my own service job.',
        },
      ),
    ).toThrow(/independent/);
  });
  it('uses explicit Lagos deadlines and rejects invalid calendar dates', () => {
    expect(lagosDateTimeToUtc('2026-11-05T17:00')).toBe('2026-11-05T16:00:00.000Z');
    expect(() => lagosDateTimeToUtc('2026-02-30T17:00')).toThrow();
    expect(() => lagosDateTimeToUtc('2026-11-05T25:00')).toThrow();
  });
});
