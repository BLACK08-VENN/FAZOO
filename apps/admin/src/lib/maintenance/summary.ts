import { canRead, overdue, type Workspace } from './model';

export type DashboardSummary = {
  title: string;
  description: string;
  scope: string;
  stats: { label: string; value: number; attention?: boolean }[];
};
export function maintenanceSummary(
  workspace: Workspace,
  requester: boolean,
  now: number,
): DashboardSummary {
  const jobs = workspace.jobs.filter((job) => canRead(job, workspace.viewer));
  const count = (predicate: (job: (typeof jobs)[number]) => boolean) =>
    jobs.filter(predicate).length;
  if (workspace.viewer.can_manage)
    return {
      title: 'Maintenance & services',
      description: 'Coordinate your company’s service requests and work orders.',
      scope: 'Up to 250 recent jobs in your active organization.',
      stats: [
        { label: 'New requests', value: count((j) => j.status === 'requested') },
        {
          label: 'Active work orders',
          value: count((j) => ['assigned', 'in_progress', 'awaiting_parts'].includes(j.status)),
        },
        {
          label: 'Urgent open jobs',
          value: count((j) => j.priority === 'urgent' && j.status !== 'completed'),
          attention: true,
        },
        { label: 'Awaiting approval', value: count((j) => j.status === 'ready_for_review') },
      ],
    };
  if (requester)
    return {
      title: 'My service requests',
      description: 'Report an issue and follow the work through to completion.',
      scope: 'Your own requests only, up to 250 recent visible jobs.',
      stats: [
        {
          label: 'Open requests',
          value: count(
            (j) => j.reported_by === workspace.viewer.id && j.status !== 'completed',
          ),
        },
        {
          label: 'Work in progress',
          value: count(
            (j) =>
              j.reported_by === workspace.viewer.id &&
              ['assigned', 'in_progress', 'awaiting_parts'].includes(j.status),
          ),
        },
        {
          label: 'Urgent open requests',
          value: count(
            (j) =>
              j.reported_by === workspace.viewer.id &&
              j.priority === 'urgent' &&
              j.status !== 'completed',
          ),
          attention: true,
        },
        {
          label: 'Completed',
          value: count(
            (j) => j.reported_by === workspace.viewer.id && j.status === 'completed',
          ),
        },
      ],
    };
  return {
    title: 'My maintenance work',
    description: 'See what needs your attention and keep assigned jobs moving.',
    scope: 'Your assignments and requests, up to 250 recent visible jobs.',
    stats: [
      {
        label: 'Active assigned jobs',
        value: count(
          (j) =>
            j.assigned_to === workspace.viewer.id &&
            ['assigned', 'in_progress', 'awaiting_parts'].includes(j.status),
        ),
      },
      {
        label: 'Overdue assignments',
        value: count((j) => j.assigned_to === workspace.viewer.id && overdue(j, now)),
        attention: true,
      },
      {
        label: 'Submitted for review',
        value: count(
          (j) => j.assigned_to === workspace.viewer.id && j.status === 'ready_for_review',
        ),
      },
      {
        label: 'My open requests',
        value: count((j) => j.reported_by === workspace.viewer.id && j.status !== 'completed'),
      },
    ],
  };
}
