import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../supabase';
import { uploadUriWithRetry } from '../photos';
import { classifySyncError } from './errors';
import {
  markDone,
  markRetry,
  markTerminal,
  pendingOps,
  pruneDone,
  setSyncing,
  type QueuedOperation,
} from './db';

export type SyncEvent =
  | { kind: 'start' | 'idle' }
  | { kind: 'op_done'; operation: string }
  | { kind: 'op_failed'; operation: string; message: string }
  | { kind: 'auth_required'; message: string };
let flushing = false;

export async function flushQueue(onEvent?: (event: SyncEvent) => void): Promise<void> {
  if (flushing) return;
  flushing = true;
  onEvent?.({ kind: 'start' });
  try {
    for (const operation of await pendingOps()) {
      await setSyncing(operation.id);
      try {
        for (const attachment of operation.attachments) {
          await uploadUriWithRetry(
            attachment.bucket,
            attachment.remotePath,
            attachment.localUri,
            attachment.mimeType,
          );
        }
        await runOperation(operation);
        await markDone(operation.id);
        for (const attachment of operation.attachments)
          await FileSystem.deleteAsync(attachment.localUri, { idempotent: true });
        onEvent?.({ kind: 'op_done', operation: operation.operation });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const disposition = classifySyncError(error);
        if (disposition === 'terminal') {
          await markTerminal(operation.id, message);
          onEvent?.({ kind: 'op_failed', operation: operation.operation, message });
          continue;
        }
        await markRetry(operation.id, operation.attempts + 1, message);
        if (disposition === 'auth') onEvent?.({ kind: 'auth_required', message });
        break;
      }
    }
    await pruneDone();
    onEvent?.({ kind: 'idle' });
  } finally {
    flushing = false;
  }
}

async function runOperation(operation: QueuedOperation): Promise<void> {
  const rpc = (
    {
      checkin: 'ba_checkin',
      checkout: 'ba_checkout',
      sale: 'ba_record_sale',
      update_sale: 'ba_update_sale',
      delete_sale: 'ba_delete_sale',
      sick_leave: 'ba_mark_sick_leave',
    } as const
  )[operation.operation];
  const { data, error } = await supabase.rpc(rpc, operation.payload as never);
  if (error) throw error;
  const result = data as unknown as { status?: string } | null;
  if (result?.status && result.status !== 'ok')
    throw new Error(`Unexpected sync result (${result.status})`);
}
