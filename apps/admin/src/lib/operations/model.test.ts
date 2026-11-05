import { describe, expect, it } from 'vitest';
import { commandSchema, dailyTasks } from './model';
import { applyOperations, initialOperations, worker } from './preview';

describe('Operations daily views and workflow', () => {
  it('filters by Lagos due date and exact campaign', () => {
    const tasks = initialOperations().tasks;
    const first = { ...tasks[0]!, due_at: '2026-11-05T23:30:00Z' };
    const second = { ...tasks[2]!, due_at: first.due_at };
    expect(dailyTasks([first, second], '2026-11-06', first.campaign_id)).toEqual([first]);
    expect(dailyTasks([first], '2026-11-05', '')).toEqual([]);
    expect(dailyTasks([first, second], '', '')).toHaveLength(2);
  });
  it('rejects forged organization and privileged fields', () => {
    const command = {
      action: 'approve',
      task_id: crypto.randomUUID(),
      expected_version: 1,
      note: 'Work reviewed.',
      organization_id: crypto.randomUUID(),
    };
    expect(commandSchema.safeParse(command).success).toBe(false);
  });
  it('moves assigned work through execution and independent review', () => {
    let workspace = initialOperations();
    const task = workspace.tasks[0]!;
    const command = {
      action: 'update' as const,
      task_id: task.id,
      expected_version: 1,
      status: 'in_progress' as const,
      note: 'Collecting display materials.',
      actual_items: [],
      recipient: '',
      evidence: [],
    };
    expect(() => applyOperations(workspace, command)).toThrow(/not allowed/);
    workspace = applyOperations({ ...workspace, viewer: worker }, command);
    workspace = applyOperations(workspace, {
      ...command,
      expected_version: 2,
      status: 'ready_for_review',
      actual_items: [{ name: 'Display stands', quantity: 2 }],
      recipient: 'Test recipient',
    });
    expect(workspace.tasks[0]?.status).toBe('ready_for_review');
    const approval = {
      action: 'approve' as const,
      task_id: task.id,
      expected_version: 3,
      note: 'Delivery reviewed and approved.',
    };
    expect(() => applyOperations(workspace, approval)).toThrow(/Independent/);
    workspace = applyOperations({ ...workspace, viewer: initialOperations().viewer }, approval);
    expect(workspace.tasks[0]?.status).toBe('completed');
    expect(workspace.tasks[0]?.events).toHaveLength(3);
  });
  it('requires acknowledgement for deliveries and rejects invalid quantities', () => {
    let workspace = initialOperations();
    const task = workspace.tasks[0]!;
    const command = {
      action: 'update' as const,
      task_id: task.id,
      expected_version: 1,
      status: 'in_progress' as const,
      note: 'Starting delivery.',
      actual_items: [],
      recipient: '',
      evidence: [],
    };
    workspace = applyOperations({ ...workspace, viewer: worker }, command);
    expect(() =>
      applyOperations(workspace, {
        ...command,
        expected_version: 2,
        status: 'ready_for_review',
      }),
    ).toThrow(/actual items/);
    expect(
      commandSchema.safeParse({ ...command, actual_items: [{ name: 'Stand', quantity: -1 }] })
        .success,
    ).toBe(false);
  });
});
