import {
  allowedUpdate,
  canReview,
  canUpdate,
  commandSchema,
  type Command,
  type Job,
  type Workspace,
} from './model';

export const DEMO_MANAGER = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Demo administrator',
  can_manage: true,
};
export const DEMO_TECH = {
  id: '10000000-0000-4000-8000-000000000002',
  name: 'Demo technician',
  can_manage: false,
};
export const DEMO_REPORTER = {
  id: '10000000-0000-4000-8000-000000000003',
  name: 'Demo requester',
  can_manage: false,
};
export function initialDemo(now = Date.now()): Workspace {
  const created = new Date(now - 86400000).toISOString();
  const make = (
    index: number,
    title: string,
    location: string,
    status: Job['status'],
    priority: Job['priority'],
  ): Job => ({
    id: `2000000${index}-0000-4000-8000-${String(index).padStart(12, '0')}`,
    title,
    location,
    status,
    priority,
    description: 'Fictional service request for testing the maintenance workflow.',
    reported_by: DEMO_REPORTER.id,
    assigned_to: status === 'requested' ? null : DEMO_TECH.id,
    technician_name: status === 'requested' ? null : DEMO_TECH.name,
    due_at:
      status === 'requested'
        ? null
        : new Date(now + (index === 2 ? -3600000 : 86400000)).toISOString(),
    instructions:
      status === 'requested'
        ? ''
        : 'Inspect the equipment, isolate the fault and record the repair.',
    completion_note:
      status === 'ready_for_review'
        ? 'Fault repaired and the equipment tested. Ready for administrator review.'
        : '',
    version: 1,
    created_at: created,
    updated_at: created,
    events: [
      {
        id: crypto.randomUUID(),
        actor_name: DEMO_REPORTER.name,
        action: 'create',
        note: 'Service issue reported.',
        created_at: created,
      },
    ],
  });
  return {
    viewer: DEMO_MANAGER,
    technicians: [DEMO_TECH],
    jobs: [
      make(1, 'Cooling unit needs inspection', 'Demo site · Meeting room', 'requested', 'high'),
      make(
        2,
        'Water pump pressure is low',
        'Demo site · Utility room',
        'in_progress',
        'urgent',
      ),
      make(
        3,
        'Replace corridor light fitting',
        'Demo site · First floor',
        'ready_for_review',
        'normal',
      ),
      make(4, 'Inspect entry door closer', 'Demo site · Main entrance', 'assigned', 'low'),
    ],
  };
}

/** Browser-only simulation; never a source of authorization for real data. */
export function applyDemo(workspace: Workspace, raw: Command, now = Date.now()): Workspace {
  const command = commandSchema.parse(raw);
  const time = new Date(now).toISOString();
  const viewer = workspace.viewer;
  if (command.action === 'create') {
    const job: Job = {
      ...command,
      id: crypto.randomUUID(),
      status: 'requested',
      reported_by: viewer.id,
      assigned_to: null,
      technician_name: null,
      due_at: null,
      instructions: '',
      completion_note: '',
      version: 1,
      created_at: time,
      updated_at: time,
      events: [
        {
          id: crypto.randomUUID(),
          actor_name: viewer.name,
          action: 'create',
          note: command.description,
          created_at: time,
        },
      ],
    };
    return { ...workspace, jobs: [job, ...workspace.jobs] };
  }
  const job = workspace.jobs.find((j) => j.id === command.job_id);
  if (!job || job.version !== command.expected_version)
    throw new Error('This job changed. Refresh it and try again.');
  let next: Job = { ...job, version: job.version + 1, updated_at: time };
  let note: string;
  if (command.action === 'assign') {
    if (!viewer.can_manage || !['requested', 'assigned'].includes(job.status))
      throw new Error('Assignment is not allowed.');
    const tech = workspace.technicians.find((t) => t.id === command.technician_id);
    if (!tech || Date.parse(command.due_at) <= now)
      throw new Error('Choose a technician and a future deadline.');
    next = {
      ...next,
      status: 'assigned',
      assigned_to: tech.id,
      technician_name: tech.name,
      due_at: command.due_at,
      instructions: command.instructions,
    };
    note = `Assigned to ${tech.name}. ${command.instructions}`;
  } else if (command.action === 'update') {
    if (!canUpdate(job, viewer) || !allowedUpdate(job.status, command.status))
      throw new Error('This update is not allowed.');
    next.status = command.status;
    if (command.status === 'ready_for_review') next.completion_note = command.note;
    note = command.note;
  } else {
    if (!canReview(job, viewer))
      throw new Error('Only an independent administrator can review this job.');
    next.status = command.action === 'approve' ? 'completed' : 'in_progress';
    if (command.action === 'reopen') next.completion_note = '';
    note = command.note;
  }
  next.events = [
    ...next.events,
    {
      id: crypto.randomUUID(),
      actor_name: viewer.name,
      action: command.action,
      note,
      created_at: time,
    },
  ];
  return { ...workspace, jobs: workspace.jobs.map((j) => (j.id === next.id ? next : j)) };
}
