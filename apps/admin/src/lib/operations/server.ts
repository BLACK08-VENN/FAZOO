import 'server-only';
import type { FazooClient } from '@fazoo/database';
import { workspaceSchema } from './model';

export async function loadOperations(client: FazooClient) {
  if (process.env.OPERATIONS_ENABLED !== 'true') throw new Error('Operations is not enabled.');
  const { data, error } = await client.rpc('operations_workspace');
  if (error) throw new Error('Operations could not be loaded.');
  const workspace = workspaceSchema.parse(data);
  const paths = [...new Set(workspace.tasks.flatMap((task) => task.evidence))];
  if (paths.length) {
    const { data: signed } = await client.storage
      .from('operations-evidence')
      .createSignedUrls(paths, 300);
    for (const entry of signed ?? []) {
      if (entry.path && entry.signedUrl && !entry.error)
        workspace.evidence_urls[entry.path] = entry.signedUrl;
    }
  }
  return workspace;
}
