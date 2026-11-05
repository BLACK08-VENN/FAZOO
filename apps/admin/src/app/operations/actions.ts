'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireApprovedProfile } from '@/lib/auth';
import { commandSchema } from '@/lib/operations/model';
import { loadOperations } from '@/lib/operations/server';

const inputSchema = z.object({ client_request_id: z.uuid(), command: commandSchema }).strict();
export async function mutateOperations(input: unknown) {
  if (process.env.OPERATIONS_ENABLED !== 'true') return { error: 'Operations is not enabled.' };
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Check the task details.' };
  const { client, profile } = await requireApprovedProfile();
  if (profile.role === 'client')
    return { error: 'Operations is for your assigned field team.' };
  const { error } = await client.rpc('operations_mutate', {
    p_client_request_id: parsed.data.client_request_id,
    p_command: parsed.data.command,
  });
  if (error)
    return {
      error:
        'Unable to save. Refresh to check the latest task, permissions and required details before retrying.',
    };
  revalidatePath('/operations');
  try {
    return { workspace: await loadOperations(client) };
  } catch {
    return {
      saved: true as const,
      error: 'Saved successfully. Refresh to load the latest tasks.',
    };
  }
}
