'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireApprovedProfile } from '@/lib/auth';
import { commandSchema } from '@/lib/maintenance/model';
import { loadMaintenanceWorkspace } from '@/lib/maintenance/server';

const mutationSchema = z
  .object({ client_request_id: z.uuid(), command: commandSchema })
  .strict();
export async function mutateMaintenance(input: unknown) {
  if (process.env.MAINTENANCE_ENABLED !== 'true')
    return { error: 'Maintenance is not enabled in this environment.' };
  const parsed = mutationSchema.safeParse(input);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Check the job details.' };
  const { client } = await requireApprovedProfile();
  const { error } = await client.rpc('maintenance_mutate', {
    p_client_request_id: parsed.data.client_request_id,
    p_command: parsed.data.command,
  });
  if (error)
    return {
      error:
        'The update could not be saved. Refresh to check the latest job; verify your permission, deadline and status before retrying.',
    };
  revalidatePath('/service-desk');
  try {
    return { workspace: await loadMaintenanceWorkspace(client) };
  } catch {
    return {
      saved: true as const,
      error: 'Your update was saved. Refresh to load the latest workspace.',
    };
  }
}
