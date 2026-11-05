import {
  allowedTransition,
  commandSchema,
  type Command,
  type Task,
  type Workspace,
} from './model';

export const organization = '30000000-0000-4000-8000-000000000001';
export const manager = {
  id: '10000000-0000-4000-8000-000000000001',
  organization_id: organization,
  name: 'Alex Morgan',
  can_manage: true,
};
export const worker = {
  id: '10000000-0000-4000-8000-000000000002',
  organization_id: organization,
  name: 'Sam Kimani',
  can_manage: false,
};
export const campaigns = [
  { id: '40000000-0000-4000-8000-000000000001', name: 'Retail execution', status: 'active' },
  { id: '40000000-0000-4000-8000-000000000002', name: 'Promotional setup', status: 'active' },
];
export function initialOperations(now = Date.now()): Workspace {
  const make = (
    index: number,
    title: string,
    kind: Task['kind'],
    status: Task['status'],
  ): Task => ({
    id: `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    campaign_id: campaigns[index === 3 ? 1 : 0]!.id,
    campaign_name: campaigns[index === 3 ? 1 : 0]!.name,
    assigned_to: worker.id,
    assignee_name: worker.name,
    kind,
    title,
    instructions: 'Count all materials and record any differences at the store.',
    origin: 'Central dispatch',
    destination: `Store ${index}`,
    priority: index === 2 ? 'urgent' : 'normal',
    due_at: new Date(now + (index === 2 ? -3600000 : 3600000)).toISOString(),
    status,
    items: [{ name: 'Display stands', quantity: 3 }],
    actual_items: [],
    recipient: '',
    completion_note: '',
    evidence: [],
    version: 1,
    created_at: new Date(now).toISOString(),
    updated_at: new Date(now).toISOString(),
    events: [],
  });
  return {
    viewer: manager,
    campaigns,
    workers: [worker, { ...manager }],
    evidence_urls: {},
    tasks: [
      make(1, 'Deliver display materials', 'delivery', 'assigned'),
      make(2, 'Collect unused activation materials', 'collection', 'blocked'),
      make(3, 'Set up the promotional stand', 'setup', 'in_progress'),
    ],
  };
}
/** Fictional preview only. Real authorization is enforced by the operations RPC. */
export function applyOperations(
  workspace: Workspace,
  raw: Command,
  now = Date.now(),
): Workspace {
  const command = commandSchema.parse(raw);
  const time = new Date(now).toISOString();
  const viewer = workspace.viewer;
  if (command.action === 'create') {
    if (!viewer.can_manage) throw new Error('Only administrators allocate tasks.');
    const campaign = workspace.campaigns.find((c) => c.id === command.campaign_id);
    const assignee = workspace.workers.find((w) => w.id === command.assigned_to);
    if (!campaign || !assignee || Date.parse(command.due_at) <= now)
      throw new Error('Choose a campaign, worker and future deadline.');
    const task: Task = {
      ...command,
      id: crypto.randomUUID(),
      campaign_name: campaign.name,
      assignee_name: assignee.name,
      status: 'assigned',
      actual_items: [],
      recipient: '',
      completion_note: '',
      evidence: [],
      version: 1,
      created_at: time,
      updated_at: time,
      events: [
        {
          id: crypto.randomUUID(),
          actor_name: viewer.name,
          action: 'create',
          note: command.instructions,
          created_at: time,
        },
      ],
    };
    return { ...workspace, tasks: [task, ...workspace.tasks] };
  }
  const task = workspace.tasks.find((t) => t.id === command.task_id);
  if (!task || task.version !== command.expected_version)
    throw new Error('Task changed. Refresh before retrying.');
  const next = { ...task, version: task.version + 1, updated_at: time };
  let note = '';
  if (command.action === 'assign') {
    const assignee = workspace.workers.find((w) => w.id === command.assigned_to);
    if (
      !viewer.can_manage ||
      !['assigned', 'blocked'].includes(task.status) ||
      !assignee ||
      Date.parse(command.due_at) <= now
    )
      throw new Error('Reassignment is not allowed.');
    Object.assign(next, {
      assigned_to: assignee.id,
      assignee_name: assignee.name,
      due_at: command.due_at,
      status: 'assigned',
      recipient: '',
      actual_items: [],
      evidence: [],
      completion_note: '',
    });
    note = `Reassigned to ${assignee.name}`;
  } else if (command.action === 'update') {
    if (task.assigned_to !== viewer.id || !allowedTransition(task.status, command.status))
      throw new Error('Update is not allowed.');
    if (command.status === 'ready_for_review') {
      if (
        ['delivery', 'collection'].includes(task.kind) &&
        (command.actual_items.length === 0 || command.recipient.length < 2)
      )
        throw new Error('Record actual items and recipient acknowledgement.');
      Object.assign(next, {
        actual_items: command.actual_items,
        recipient: command.recipient,
        completion_note: command.note,
        evidence: command.evidence,
      });
    }
    next.status = command.status;
    note = command.note;
  } else {
    if (
      !viewer.can_manage ||
      task.assigned_to === viewer.id ||
      task.status !== 'ready_for_review'
    )
      throw new Error('Independent administrator review required.');
    next.status = command.action === 'approve' ? 'completed' : 'in_progress';
    note = command.note;
  }
  next.events = [
    ...task.events,
    {
      id: crypto.randomUUID(),
      actor_name: viewer.name,
      action: command.action,
      note,
      created_at: time,
    },
  ];
  return { ...workspace, tasks: workspace.tasks.map((t) => (t.id === next.id ? next : t)) };
}
