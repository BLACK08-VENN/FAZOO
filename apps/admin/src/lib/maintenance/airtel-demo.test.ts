import { describe, expect, it } from 'vitest';
import { initialAirtelDemo } from './airtel-demo';
import { applyDemo, DEMO_TECH, DEMO_MANAGER, initialDemo } from './demo';
import { workspaceSchema } from './model';

describe('Airtel fictional maintenance demo', () => {
  it('seeds a separate ISP scenario without real customer coordinates', () => {
    const demo = workspaceSchema.parse(initialAirtelDemo());
    expect(demo.jobs).toHaveLength(5);
    expect(demo.jobs.every((job) => job.pin === null)).toBe(true);
    expect(demo.jobs.some((job) => job.title.includes('Fibre link'))).toBe(
      true,
    );
    expect(initialDemo().jobs).toHaveLength(4);
  });
  it('resumes a parts-delayed job and requires manager completion review', () => {
    let demo = initialAirtelDemo();
    const pending = demo.jobs.find((job) => job.status === 'awaiting_parts')!;
    demo = { ...demo, viewer: DEMO_TECH };
    demo = applyDemo(demo, {
      action: 'update',
      job_id: pending.id,
      expected_version: pending.version,
      status: 'in_progress',
      note: 'Demo router available. Simulated work resumed.',
    });
    const active = demo.jobs.find((job) => job.id === pending.id)!;
    demo = applyDemo(demo, {
      action: 'update',
      job_id: active.id,
      expected_version: active.version,
      status: 'ready_for_review',
      note: 'Simulated connection tests completed.',
    });
    const review = demo.jobs.find((job) => job.id === pending.id)!;
    expect(() =>
      applyDemo(demo, {
        action: 'approve',
        job_id: review.id,
        expected_version: review.version,
        note: 'Approve fictional service.',
      }),
    ).toThrow();
    demo = applyDemo(
      { ...demo, viewer: DEMO_MANAGER },
      {
        action: 'approve',
        job_id: review.id,
        expected_version: review.version,
        note: 'Approve fictional service.',
      },
    );
    expect(demo.jobs.find((job) => job.id === pending.id)!.status).toBe(
      'completed',
    );
  });
  it('resetting the Airtel seed retains ISP jobs and discards demo edits', () => {
    const demo = initialAirtelDemo();
    demo.jobs[0]!.title = 'Temporary fictional edit';
    const reset = initialAirtelDemo();
    expect(reset.jobs[0]!.title).toBe('Customer connection needs diagnosis');
  });
});
