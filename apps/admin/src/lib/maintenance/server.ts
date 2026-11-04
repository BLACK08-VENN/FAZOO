import 'server-only';
import type { FazooClient } from '@fazoo/database';
import { requireApprovedProfile } from '@/lib/auth';
import { workspaceSchema } from './model';

export async function loadMaintenanceWorkspace(verifiedClient?: FazooClient) {
  if (process.env.MAINTENANCE_ENABLED !== 'true')
    throw new Error('Maintenance is not enabled.');
  const client = verifiedClient ?? (await requireApprovedProfile()).client;
  const { data, error } = await client.rpc('maintenance_workspace');
  if (error)
    throw new Error('The service desk could not be loaded. Check the test database setup.');
  return workspaceSchema.parse(data);
}
