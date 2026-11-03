import { initialDemo } from './demo';
import type { Workspace } from './model';

/** Unaffiliated ISP case study; no actual Airtel sites, customers, faults or network data. */
export function initialAirtelDemo(now = Date.now()): Workspace {
  const workspace = initialDemo(now);
  const scenarios = [
    {
      title: 'Customer connection needs diagnosis',
      location: 'Demo customer premises A · Router cabinet',
      address: 'Fictional customer site A · Demo City',
      details: 'Demonstration router cabinet at the simulated entrance.',
      description:
        'Simulated intermittent internet connection. Record a diagnostic visit and findings; no live customer connection is involved.',
      instructions: '',
      completion: '',
    },
    {
      title: 'Fibre link unavailable at Demo Site B',
      location: 'Demo network node B · Fibre cabinet',
      address: 'Fictional network site B · Demo City',
      details: 'Demonstration fibre cabinet in the simulated equipment room.',
      description:
        'Urgent fictional link fault for demonstrating dispatch, progress updates and service restoration review.',
      instructions:
        'Use the simulated job to record findings, repair notes and test results. No real network access or changes.',
      completion: '',
    },
    {
      title: 'Backup power inspection ready for review',
      location: 'Demo network node C · Power rack',
      address: 'Fictional network site C · Demo City',
      details:
        'Demonstration backup power rack; no physical equipment is connected.',
      description:
        'Fictional preventive power inspection submitted for completion approval.',
      instructions:
        'Record the simulated inspection outcome and submit it to the service manager.',
      completion:
        'Demo inspection complete. Simulated power checks recorded; awaiting independent approval.',
    },
    {
      title: 'Scheduled router and cabling inspection',
      location: 'Demo service site D · Equipment rack',
      address: 'Fictional service site D · Demo City',
      details: 'Demonstration rack at the simulated service office.',
      description:
        'Routine fictional router and cabling inspection to demonstrate planned technician work.',
      instructions:
        'Complete the simulated inspection and record findings before submission.',
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
        note: 'Fictional ISP service issue reported for the Airtel case-study demo.',
      })),
    };
  });
  const base = workspace.jobs[3]!;
  workspace.jobs.push({
    ...base,
    id: '20000005-0000-4000-8000-000000000005',
    title: 'Replacement access router awaited',
    location: 'Demo service site E · Access cabinet',
    address: 'Fictional service site E · Demo City',
    location_details:
      'Demonstration access cabinet. No actual customer address.',
    description:
      'Fictional parts delay. Resume the job when a simulated replacement becomes available.',
    instructions:
      'Record the demo parts delay, then resume, test and submit for service-manager review.',
    completion_note: '',
    priority: 'high',
    status: 'awaiting_parts',
    due_at: new Date(now + 2 * 86400000).toISOString(),
    events: [
      {
        ...base.events[0]!,
        id: crypto.randomUUID(),
        action: 'update',
        note: 'Demo replacement router pending. No supplier order has been placed.',
      },
    ],
  });
  return workspace;
}
