import { z } from 'zod';
import { lagosDate } from '@fazoo/config';

export const kinds = ['task', 'delivery', 'collection', 'setup'] as const;
export const states = [
  'assigned',
  'in_progress',
  'blocked',
  'ready_for_review',
  'completed',
] as const;
export const labels: Record<(typeof states)[number], string> = {
  assigned: 'Assigned',
  in_progress: 'In progress',
  blocked: 'Blocked',
  ready_for_review: 'Awaiting review',
  completed: 'Completed',
};
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const target = { task_id: z.uuid(), expected_version: z.number().int().positive() };
export const itemSchema = z
  .object({ name: text(1, 120), quantity: z.number().int().positive().max(1000000) })
  .strict();
export const commandSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('create'),
      campaign_id: z.uuid(),
      assigned_to: z.uuid(),
      kind: z.enum(kinds),
      title: text(5, 160),
      instructions: text(5, 2000),
      origin: text(0, 240),
      destination: text(3, 240),
      due_at: z.iso.datetime({ offset: true }),
      priority: z.enum(['normal', 'high', 'urgent']),
      items: z.array(itemSchema).max(30),
    })
    .strict()
    .refine(
      (c) =>
        !['delivery', 'collection'].includes(c.kind) ||
        (c.items.length > 0 && c.origin.length >= 3),
      {
        message: 'Deliveries and collections need an origin and at least one item.',
      },
    ),
  z
    .object({
      action: z.literal('assign'),
      ...target,
      assigned_to: z.uuid(),
      due_at: z.iso.datetime({ offset: true }),
    })
    .strict(),
  z
    .object({
      action: z.literal('update'),
      ...target,
      status: z.enum(['in_progress', 'blocked', 'ready_for_review']),
      note: text(5, 2000),
      recipient: text(0, 160),
      actual_items: z.array(itemSchema).max(30),
      evidence: z.array(text(1, 300)).max(4),
    })
    .strict(),
  z.object({ action: z.literal('approve'), ...target, note: text(5, 2000) }).strict(),
  z.object({ action: z.literal('reopen'), ...target, note: text(5, 2000) }).strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export const taskSchema = z.object({
  id: z.uuid(),
  campaign_id: z.uuid(),
  campaign_name: z.string(),
  assigned_to: z.uuid(),
  assignee_name: z.string(),
  kind: z.enum(kinds),
  title: z.string(),
  instructions: z.string(),
  origin: z.string(),
  destination: z.string(),
  due_at: z.string(),
  priority: z.enum(['normal', 'high', 'urgent']),
  status: z.enum(states),
  items: z.array(itemSchema),
  actual_items: z.array(itemSchema),
  recipient: z.string(),
  completion_note: z.string(),
  evidence: z.array(z.string()),
  version: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  events: z.array(
    z.object({
      id: z.uuid(),
      actor_name: z.string(),
      action: z.string(),
      note: z.string(),
      created_at: z.string(),
    }),
  ),
});
export type Task = z.infer<typeof taskSchema>;
export const workspaceSchema = z.object({
  viewer: z.object({
    id: z.uuid(),
    organization_id: z.uuid(),
    name: z.string(),
    can_manage: z.boolean(),
  }),
  campaigns: z.array(
    z.object({ id: z.uuid(), name: z.string(), status: z.string().default('active') }),
  ),
  workers: z.array(z.object({ id: z.uuid(), name: z.string() })),
  tasks: z.array(taskSchema),
  evidence_urls: z.record(z.string(), z.string()).default({}),
});
export type Workspace = z.infer<typeof workspaceSchema>;
export function allowedTransition(from: Task['status'], to: string) {
  return (
    (from === 'assigned' && to === 'in_progress') ||
    (from === 'in_progress' && ['in_progress', 'blocked', 'ready_for_review'].includes(to)) ||
    (from === 'blocked' && ['blocked', 'in_progress'].includes(to))
  );
}
export function dailyTasks(tasks: Task[], date: string, campaignId: string) {
  return tasks.filter(
    (task) =>
      (!date || lagosDate(task.due_at) === date) &&
      (!campaignId || task.campaign_id === campaignId),
  );
}
