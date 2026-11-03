import { z } from 'zod';

export const personas = [
  'Technician',
  'Brand ambassador',
  'Merchandiser',
] as const;
export type Persona = (typeof personas)[number];
export const statusLabels = {
  new: 'New assignment',
  acknowledged: 'Acknowledged',
  arrived: 'On site',
  in_progress: 'In progress',
  awaiting_parts: 'Awaiting parts',
  ready_for_review: 'Awaiting review',
  completed: 'Completed',
  reassignment_requested: 'Reassignment requested',
} as const;
export type Status = keyof typeof statusLabels;
const taskSchema = z.object({
  id: z.string(),
  label: z.string(),
  done: z.boolean(),
});
export const assignmentSchema = z.object({
  id: z.string(),
  persona: z.enum(personas),
  company: z.enum(['Airtel', 'Hanan']),
  title: z.string(),
  location: z.string(),
  address: z.string(),
  access: z.string(),
  supervisor: z.string(),
  instructions: z.string(),
  priority: z.enum(['Urgent', 'High', 'Normal']),
  status: z.enum([
    'new',
    'acknowledged',
    'arrived',
    'in_progress',
    'awaiting_parts',
    'ready_for_review',
    'completed',
    'reassignment_requested',
  ]),
  assignedAt: z.iso.datetime(),
  dueAt: z.iso.datetime(),
  read: z.boolean(),
  arrivedAt: z.iso.datetime().nullable(),
  tasks: z.array(taskSchema).max(12),
  photos: z
    .array(
      z
        .string()
        .max(160000)
        .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/),
    )
    .max(3),
  note: z.string().max(1500),
  events: z
    .array(z.object({ at: z.iso.datetime(), text: z.string() }))
    .max(150),
});
export type Assignment = z.infer<typeof assignmentSchema>;
export const workerSessionSchema = z.object({
  version: z.literal(1),
  assignments: z.array(assignmentSchema).max(50),
});
export type WorkerSession = z.infer<typeof workerSessionSchema>;
export function initialWorkerSession(now = Date.now()): WorkerSession {
  const at = new Date(now - 15 * 60000).toISOString();
  const rows: Assignment[] = [];
  for (const persona of personas) {
    const tech = persona === 'Technician';
    const specs = tech
      ? [
          [
            'Fibre link unavailable at Site B',
            'Network node B',
            'new',
            'Urgent',
            4,
          ],
          [
            'Router and cabling inspection',
            'Service site D',
            'in_progress',
            'Normal',
            24,
          ],
          [
            'Backup power health check',
            'Network node C',
            'in_progress',
            'High',
            8,
          ],
          [
            'Access router replacement',
            'Service site E',
            'ready_for_review',
            'Normal',
            24,
          ],
        ]
      : [
          [
            persona === 'Merchandiser'
              ? 'Shelf availability and display check'
              : 'Product activation and sales visit',
            'Outlet A',
            'new',
            'High',
            4,
          ],
          [
            'Stock and replenishment follow-up',
            'Outlet B',
            'in_progress',
            'Normal',
            8,
          ],
          [
            'Campaign display and pricing check',
            'Outlet C',
            'in_progress',
            'Normal',
            24,
          ],
          ['Follow-up store visit', 'Outlet D', 'acknowledged', 'Normal', 24],
        ];
    specs.forEach((s, index) => {
      const taskLabels = tech
        ? ['Record diagnostic findings', 'Record repair and test results']
        : persona === 'Merchandiser'
          ? [
              'Check product availability',
              'Count shelf stock',
              'Photograph the display',
              'Record competitor prices',
            ]
          : [
              'Check campaign display',
              'Record sales activity',
              'Photograph the display',
              'Record customer feedback',
            ];
      const review = s[2] === 'ready_for_review';
      rows.push({
        id:
          (tech ? 'tech' : persona === 'Merchandiser' ? 'merch' : 'ba') +
          '-' +
          (index + 1),
        persona,
        company: tech ? 'Airtel' : 'Hanan',
        title: s[0] as string,
        location: s[1] as string,
        address: tech
          ? 'Operations district · ' + String(s[1])
          : 'Retail district · Store ' + String.fromCharCode(65 + index),
        access: tech
          ? 'Check in with the site coordinator before entering the equipment area.'
          : 'Ask for the store supervisor and confirm the visit area before starting.',
        supervisor: tech ? 'Service manager' : 'Field supervisor',
        instructions: tech
          ? 'Inspect the assigned equipment, document the findings and repair outcome, then submit connection test results for review.'
          : 'Complete the assigned checklist, record any stock gaps and attach a display photo before submitting the visit report.',
        priority: s[3] as Assignment['priority'],
        status: s[2] as Status,
        assignedAt: index === 0 ? at : new Date(now - 90 * 60000).toISOString(),
        dueAt: new Date(now + Number(s[4]) * 3600000).toISOString(),
        read: index !== 0,
        arrivedAt:
          s[2] === 'in_progress'
            ? new Date(now - 45 * 60000).toISOString()
            : null,
        tasks: taskLabels.map((label, i) => ({
          id: label.includes('Photograph') ? 'photo' : 'task-' + i,
          label,
          done: review,
        })),
        photos: [],
        note: review ? 'Work submitted. Awaiting supervisor review.' : '',
        events: [
          {
            at,
            text: review
              ? 'Completion submitted for supervisor review.'
              : 'Assignment received from ' +
                (tech ? 'Service manager.' : 'Field supervisor.'),
          },
        ],
      });
    });
  }
  return { version: 1, assignments: rows };
}
const base = { id: z.string().min(1) };
export const workerCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('open'), ...base }).strict(),
  z.object({ action: z.literal('acknowledge'), ...base }).strict(),
  z.object({ action: z.literal('arrive'), ...base }).strict(),
  z.object({ action: z.literal('start'), ...base }).strict(),
  z
    .object({
      action: z.literal('requestReassignment'),
      ...base,
      note: z.string().trim().min(5).max(1500),
    })
    .strict(),
  z
    .object({
      action: z.literal('block'),
      ...base,
      note: z.string().trim().min(5).max(1500),
    })
    .strict(),
  z
    .object({
      action: z.literal('resume'),
      ...base,
      note: z.string().trim().min(5).max(1500),
    })
    .strict(),
  z
    .object({
      action: z.literal('task'),
      ...base,
      taskId: z.string(),
      done: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal('photo'),
      ...base,
      data: z
        .string()
        .max(160000)
        .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/),
    })
    .strict(),
  z
    .object({
      action: z.literal('submit'),
      ...base,
      note: z.string().trim().min(10).max(1500),
    })
    .strict(),
]);
export type WorkerCommand = z.infer<typeof workerCommandSchema>;
export function applyWorkerCommand(
  input: WorkerSession,
  persona: Persona,
  raw: WorkerCommand,
  now = Date.now(),
): WorkerSession {
  const command = workerCommandSchema.parse(raw);
  const current = input.assignments.find((j) => j.id === command.id);
  if (!current || current.persona !== persona)
    throw new Error('This assignment is not in your workspace.');
  if (command.action === 'open') {
    if (current.read) return input;
    return {
      ...input,
      assignments: input.assignments.map((j) =>
        j.id === current.id ? { ...j, read: true } : j,
      ),
    };
  }
  const next = structuredClone(input);
  const job = next.assignments.find((j) => j.id === command.id)!;
  const at = new Date(now).toISOString();
  let event = '';
  switch (command.action) {
    case 'acknowledge':
      if (job.status !== 'new')
        throw new Error('This assignment has already been acknowledged.');
      job.status = 'acknowledged';
      job.read = true;
      event = 'Assignment acknowledged.';
      break;
    case 'requestReassignment':
      if (!['new', 'acknowledged'].includes(job.status))
        throw new Error(
          'Contact your supervisor about reassigning work that has already started.',
        );
      job.status = 'reassignment_requested';
      job.read = true;
      job.note = command.note;
      event = 'Reassignment requested: ' + command.note;
      break;
    case 'arrive':
      if (job.status !== 'acknowledged')
        throw new Error('Acknowledge the assignment before recording arrival.');
      job.status = 'arrived';
      job.arrivedAt = at;
      event =
        persona === 'Technician'
          ? 'Arrival recorded.'
          : 'Store check-in recorded.';
      break;
    case 'start':
      if (job.status !== 'arrived')
        throw new Error('Record your arrival before starting work.');
      job.status = 'in_progress';
      event =
        persona === 'Technician' ? 'Work started.' : 'Visit tasks started.';
      break;
    case 'block':
      if (persona !== 'Technician' || job.status !== 'in_progress')
        throw new Error(
          'Only an active technician job can be marked awaiting parts.',
        );
      job.status = 'awaiting_parts';
      job.note = command.note;
      event = 'Parts delay reported: ' + command.note;
      break;
    case 'resume':
      if (persona !== 'Technician' || job.status !== 'awaiting_parts')
        throw new Error('This job is not awaiting parts.');
      job.status = 'in_progress';
      job.note = command.note;
      event = 'Work resumed: ' + command.note;
      break;
    case 'task': {
      if (job.status !== 'in_progress')
        throw new Error('Start work before updating the checklist.');
      const task = job.tasks.find((t) => t.id === command.taskId);
      if (!task) throw new Error('Checklist item not found.');
      if (task.id === 'photo')
        throw new Error('Attach a photo to complete the photo task.');
      task.done = command.done;
      event = task.label + (task.done ? ' completed.' : ' reopened.');
      break;
    }
    case 'photo': {
      if (job.status !== 'in_progress')
        throw new Error('Start work before attaching evidence.');
      if (job.photos.length >= 3)
        throw new Error('Up to three photos can be attached.');
      job.photos.push(command.data);
      const task = job.tasks.find((t) => t.id === 'photo');
      if (task) task.done = true;
      event = 'Work photo attached.';
      break;
    }
    case 'submit':
      if (job.status !== 'in_progress')
        throw new Error('Only work in progress can be submitted.');
      if (job.tasks.some((t) => !t.done))
        throw new Error('Complete the required checklist before submitting.');
      if (persona !== 'Technician' && !job.photos.length)
        throw new Error('Attach a display photo before submitting the visit.');
      job.status = 'ready_for_review';
      job.note = command.note;
      event =
        persona === 'Technician'
          ? 'Completion submitted for manager review.'
          : 'Visit report submitted and check-out recorded.';
      break;
  }
  job.events.push({ at, text: event });
  return workerSessionSchema.parse(next);
}
export function nextAction(job: Assignment): string {
  const tech = job.persona === 'Technician';
  return {
    new: 'View assignment',
    acknowledged: tech ? 'Record arrival' : 'Check in',
    arrived: tech ? 'Start work' : 'Start visit',
    in_progress: tech ? 'Update work' : 'Complete visit tasks',
    awaiting_parts: 'Review parts delay',
    ready_for_review: 'View submission',
    completed: 'View completed work',
    reassignment_requested: 'View reassignment request',
  }[job.status];
}
