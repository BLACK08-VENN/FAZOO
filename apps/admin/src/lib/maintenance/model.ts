import { z } from 'zod';

export const statuses = [
  'requested',
  'assigned',
  'in_progress',
  'awaiting_parts',
  'ready_for_review',
  'completed',
] as const;
export const statusLabels: Record<Status, string> = {
  requested: 'New request',
  assigned: 'Assigned',
  in_progress: 'In progress',
  awaiting_parts: 'Awaiting parts',
  ready_for_review: 'Ready for review',
  completed: 'Completed',
};
export type Status = (typeof statuses)[number];
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const version = z.number().int().positive();
const target = { job_id: z.uuid(), expected_version: version };
export const commandSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('create'),
      title: text(5, 160),
      description: text(10, 3000),
      location: text(3, 240),
      priority: z.enum(['low', 'normal', 'high', 'urgent']),
    })
    .strict(),
  z
    .object({
      action: z.literal('assign'),
      ...target,
      technician_id: z.uuid(),
      due_at: z.iso.datetime({ offset: true }),
      instructions: text(5, 2000),
    })
    .strict(),
  z
    .object({
      action: z.literal('update'),
      ...target,
      status: z.enum(['in_progress', 'awaiting_parts', 'ready_for_review']),
      note: text(5, 2000),
    })
    .strict(),
  z.object({ action: z.literal('approve'), ...target, note: text(5, 2000) }).strict(),
  z.object({ action: z.literal('reopen'), ...target, note: text(5, 2000) }).strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export const eventSchema = z.object({
  id: z.uuid(),
  actor_name: z.string(),
  action: z.string(),
  note: z.string(),
  created_at: z.string(),
});
export const jobSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string(),
  location: z.string(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  status: z.enum(statuses),
  reported_by: z.uuid(),
  assigned_to: z.uuid().nullable(),
  technician_name: z.string().nullable(),
  due_at: z.string().nullable(),
  instructions: z.string(),
  completion_note: z.string(),
  version,
  created_at: z.string(),
  updated_at: z.string(),
  events: z.array(eventSchema),
});
export type Job = z.infer<typeof jobSchema>;
export const workspaceSchema = z.object({
  viewer: z.object({ id: z.uuid(), name: z.string(), can_manage: z.boolean() }),
  technicians: z.array(z.object({ id: z.uuid(), name: z.string() })),
  jobs: z.array(jobSchema),
});
export type Workspace = z.infer<typeof workspaceSchema>;

export function canRead(job: Job, viewer: Workspace['viewer']) {
  return viewer.can_manage || job.reported_by === viewer.id || job.assigned_to === viewer.id;
}
export function canUpdate(job: Job, viewer: Workspace['viewer']) {
  return (
    job.assigned_to === viewer.id &&
    ['assigned', 'in_progress', 'awaiting_parts'].includes(job.status)
  );
}
export function canReview(job: Job, viewer: Workspace['viewer']) {
  return (
    viewer.can_manage && job.assigned_to !== viewer.id && job.status === 'ready_for_review'
  );
}
export function allowedUpdate(from: Status, to: Status) {
  return (
    (from === 'assigned' && to === 'in_progress') ||
    (from === 'in_progress' &&
      ['in_progress', 'awaiting_parts', 'ready_for_review'].includes(to)) ||
    (from === 'awaiting_parts' && ['awaiting_parts', 'in_progress'].includes(to))
  );
}
export function overdue(job: Job, now: number) {
  return job.due_at !== null && job.status !== 'completed' && Date.parse(job.due_at) < now;
}
export function jobNumber(job: Job) {
  return `${job.status === 'requested' ? 'SR' : 'WO'}-${job.id.slice(0, 8).toUpperCase()}`;
}
