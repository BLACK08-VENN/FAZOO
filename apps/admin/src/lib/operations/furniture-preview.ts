import { initialOperations } from './preview';
import type { Task, Workspace } from './model';

export function initialFurnitureOperations(): Workspace {
  const workspace = initialOperations();
  const organization_id = '30000000-0000-4000-8000-000000000002';
  const viewer = {
    ...workspace.viewer,
    id: '10000000-0000-4000-8000-000000000003',
    organization_id,
    name: 'Dispatch coordinator',
  };
  const crew = {
    id: '10000000-0000-4000-8000-000000000004',
    name: 'Delivery & installation crew',
  };
  const showroom = {
    id: '40000000-0000-4000-8000-000000000003',
    name: 'Showroom orders',
    status: 'active',
  };
  const afterSales = {
    id: '40000000-0000-4000-8000-000000000004',
    name: 'After-sales care',
    status: 'active',
  };
  const [delivery, service, installation] = workspace.tasks as [Task, Task, Task];
  const tasks: Task[] = [
    {
      ...delivery,
      id: '20000000-0000-4000-8000-000000000004',
      title: 'FR-1042 · Deliver office desks and chairs',
      instructions:
        'Check the order quantities before loading and record who received the furniture.',
      origin: 'Showroom dispatch',
      destination: 'Customer site A · Office reception',
      items: [
        { name: 'Workstation desk', quantity: 4 },
        { name: 'Task chair', quantity: 4 },
      ],
    },
    {
      ...service,
      id: '20000000-0000-4000-8000-000000000005',
      kind: 'task',
      title: 'FR-1038 · Replace damaged cabinet panel',
      instructions:
        'The crew reported a damaged side panel. Confirm the replacement is ready before scheduling the return visit.',
      origin: 'Parts counter',
      destination: 'Customer site B · Meeting room',
      items: [{ name: 'Replacement side panel', quantity: 1 }],
    },
    {
      ...installation,
      id: '20000000-0000-4000-8000-000000000006',
      title: 'FR-1042 · Assemble and install workstations',
      instructions:
        'Assemble the desks, check alignment and stability, and attach completion photos for review.',
      origin: 'Showroom dispatch',
      destination: 'Customer site A · Office floor',
      items: [{ name: 'Workstation desk', quantity: 4 }],
    },
  ];
  return {
    ...workspace,
    viewer,
    workers: [crew],
    campaigns: [showroom, afterSales],
    tasks: tasks.map((task) => {
      const campaign = task.kind === 'task' ? afterSales : showroom;
      return {
        ...task,
        campaign_id: campaign.id,
        campaign_name: campaign.name,
        assigned_to: crew.id,
        assignee_name: crew.name,
      };
    }),
  };
}
