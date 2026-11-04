import { describe, expect, it } from 'vitest';
import { initialDemo, DEMO_TECH, DEMO_REPORTER } from './demo';
import { maintenanceSummary } from './summary';

describe('Maintenance dashboard scope', () => {
  const now = Date.now();
  it('gives administrators the active company work summary', () => {
    const summary = maintenanceSummary(initialDemo(now), false, now);
    expect(summary.stats.map((s) => s.value)).toEqual([1, 2, 1, 1]);
  });
  it('counts only the technician’s own assignments', () => {
    const workspace = initialDemo(now);
    workspace.viewer = DEMO_TECH;
    workspace.jobs.push({
      ...workspace.jobs[1]!,
      id: crypto.randomUUID(),
      assigned_to: crypto.randomUUID(),
    });
    expect(maintenanceSummary(workspace, false, now).stats.map((s) => s.value)).toEqual([
      2, 1, 1, 0,
    ]);
  });
  it('does not include another requester’s work in client totals', () => {
    const workspace = initialDemo(now);
    workspace.viewer = DEMO_REPORTER;
    workspace.jobs.push({
      ...workspace.jobs[0]!,
      id: crypto.randomUUID(),
      reported_by: crypto.randomUUID(),
    });
    const summary = maintenanceSummary(workspace, true, now);
    expect(summary.title).toBe('My service requests');
    expect(summary.stats.map((s) => s.value)).toEqual([4, 2, 1, 0]);
  });
});
