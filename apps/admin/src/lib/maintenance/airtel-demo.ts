import { initialDemo } from './demo';
import type { Workspace } from './model';

/** Unaffiliated ISP case study; no actual Airtel sites, customers, faults or network data. */
export function initialAirtelDemo(now = Date.now()): Workspace {
  const workspace = initialDemo(now);
  const scenarios = [
    {
      title: 'Customer connection needs diagnosis',
      location: 'Customer site A · Router cabinet',
      address: 'Customer site A · Access point',
      details: 'Router cabinet near the main entrance.',
      description:
        'Intermittent internet connection reported. Record diagnostic findings and follow-up actions.',
      instructions: '',
      completion: '',
    },
    {
      title: 'Fibre link unavailable at Site B',
      location: 'Network node B · Fibre cabinet',
      address: 'Network site B · Operations district',
      details: 'Fibre cabinet in the equipment room.',
      description:
        'Link unavailable. Prioritize site attendance, record repair progress and submit service restoration checks.',
      instructions:
        'Record diagnostic findings, work completed and connection test results.',
      completion: '',
    },
    {
      title: 'Backup power inspection ready for review',
      location: 'Network node C · Power rack',
      address: 'Network site C · Operations district',
      details: 'Backup power rack in the equipment room.',
      description:
        'Preventive power inspection submitted for completion approval.',
      instructions:
        'Record inspection outcomes and submit them to the service manager.',
      completion:
        'Inspection complete. Power checks recorded; awaiting independent approval.',
    },
    {
      title: 'Scheduled router and cabling inspection',
      location: 'Service site D · Equipment rack',
      address: 'Service site D · Operations district',
      details: 'Equipment rack at the service office.',
      description: 'Scheduled router and cabling inspection.',
      instructions:
        'Complete the inspection and record findings before submission.',
      completion: '',
    },
  ];
  workspace.jobs = workspace.jobs.map((job, index) => {
    const scenario = scenarios[index]!;
    return {
      ...job,
      title: scenario.title,
      location: scenario.location,
      address: scenario.address,
      location_details: scenario.details,
      description: scenario.description,
      instructions: scenario.instructions,
      completion_note: scenario.completion,
      events: job.events.map((event) => ({
        ...event,
        note: 'Service issue reported.',
      })),
    };
  });
  const base = workspace.jobs[3]!;
  workspace.jobs.push({
    ...base,
    id: '20000005-0000-4000-8000-000000000005',
    title: 'Replacement access router awaited',
    location: 'Service site E · Access cabinet',
    address: 'Service site E · Operations district',
    location_details: 'Access cabinet at the service entrance.',
    description:
      'Awaiting a replacement router. Resume the job when the part becomes available.',
    instructions:
      'Record the parts delay, then resume, test and submit for service-manager review.',
    completion_note: '',
    priority: 'high',
    status: 'awaiting_parts',
    due_at: new Date(now + 2 * 86400000).toISOString(),
    events: [
      {
        ...base.events[0]!,
        id: crypto.randomUUID(),
        action: 'update',
        note: 'Replacement router pending.',
      },
    ],
  });
  return workspace;
}
