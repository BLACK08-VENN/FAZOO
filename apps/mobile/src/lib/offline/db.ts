import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';

export type OperationName =
  | 'checkin'
  | 'checkout'
  | 'sale'
  | 'update_sale'
  | 'delete_sale'
  | 'sick_leave'
  | 'leave_request';
export type OperationStatus = 'pending' | 'syncing' | 'done' | 'terminal';
export interface QueuedAttachment {
  localUri: string;
  bucket: 'daily-log-photos';
  remotePath: string;
  mimeType: string;
}
export interface QueuedOperation {
  id: string;
  operation: OperationName;
  payload: Record<string, unknown>;
  attachments: QueuedAttachment[];
  client_request_id: string;
  status: OperationStatus;
  attempts: number;
  last_error: string | null;
  retry_at: number;
  created_at: number;
}
type StoredOperation = Omit<QueuedOperation, 'payload' | 'attachments'> & {
  payload: string;
  attachments: string;
};
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function db(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise)
    dbPromise = SQLite.openDatabaseAsync('fazoo.db').then(async (database) => {
      await database.execAsync(`PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS ops (
        id TEXT PRIMARY KEY, operation TEXT NOT NULL, payload TEXT NOT NULL,
        attachments TEXT NOT NULL DEFAULT '[]', client_request_id TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT, retry_at INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
      );`);
      const columns = await database.getAllAsync<{ name: string }>('PRAGMA table_info(ops)');
      const names = new Set(columns.map((column) => column.name));
      if (!names.has('attachments'))
        await database.execAsync(
          "ALTER TABLE ops ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]'",
        );
      if (!names.has('retry_at'))
        await database.execAsync(
          'ALTER TABLE ops ADD COLUMN retry_at INTEGER NOT NULL DEFAULT 0',
        );
      await database.runAsync("UPDATE ops SET status = 'pending' WHERE status = 'syncing'");
      return database;
    });
  return dbPromise;
}

export const newRequestId = (): string => Crypto.randomUUID();

export async function enqueue(
  operation: OperationName,
  payload: Record<string, unknown>,
  requestId = newRequestId(),
  attachments: QueuedAttachment[] = [],
): Promise<string> {
  const database = await db();
  await database.runAsync(
    `INSERT OR IGNORE INTO ops (id, operation, payload, attachments, client_request_id, status, attempts, retry_at, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', 0, 0, ?)`,
    Crypto.randomUUID(),
    operation,
    JSON.stringify(payload),
    JSON.stringify(attachments),
    requestId,
    Date.now(),
  );
  return requestId;
}

function hydrate(row: StoredOperation): QueuedOperation {
  return {
    ...row,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    attachments: JSON.parse(row.attachments || '[]') as QueuedAttachment[],
  };
}

export async function pendingOps(now = Date.now()): Promise<QueuedOperation[]> {
  const database = await db();
  return (
    await database.getAllAsync<StoredOperation>(
      "SELECT * FROM ops WHERE status = 'pending' AND retry_at <= ? ORDER BY created_at ASC LIMIT 100",
      now,
    )
  ).map(hydrate);
}

export async function setSyncing(id: string): Promise<void> {
  const database = await db();
  await database.runAsync(
    "UPDATE ops SET status = 'syncing', attempts = attempts + 1, last_error = NULL WHERE id = ?",
    id,
  );
}
export async function markDone(id: string): Promise<void> {
  const database = await db();
  await database.runAsync("UPDATE ops SET status = 'done', last_error = NULL WHERE id = ?", id);
}
export async function markTerminal(id: string, message: string): Promise<void> {
  const database = await db();
  await database.runAsync(
    "UPDATE ops SET status = 'terminal', last_error = ? WHERE id = ?",
    message,
    id,
  );
}
export async function markRetry(id: string, attempts: number, message: string): Promise<void> {
  const database = await db();
  const retryAt = Date.now() + Math.min(5 * 60_000, 2 ** Math.min(attempts, 6) * 2_000);
  await database.runAsync(
    "UPDATE ops SET status = 'pending', last_error = ?, retry_at = ? WHERE id = ?",
    message,
    retryAt,
    id,
  );
}
export async function operationCounts(): Promise<{ pending: number; failed: number }> {
  const database = await db();
  const rows = await database.getAllAsync<{ status: OperationStatus; n: number }>(
    "SELECT status, COUNT(*) as n FROM ops WHERE status IN ('pending','syncing','terminal') GROUP BY status",
  );
  return rows.reduce(
    (result, row) => {
      if (row.status === 'terminal') result.failed += row.n;
      else result.pending += row.n;
      return result;
    },
    { pending: 0, failed: 0 },
  );
}
export async function retryTerminal(): Promise<void> {
  const database = await db();
  await database.runAsync(
    "UPDATE ops SET status = 'pending', retry_at = 0 WHERE status = 'terminal'",
  );
}
export async function pruneDone(): Promise<void> {
  const database = await db();
  await database.runAsync(
    "DELETE FROM ops WHERE status = 'done' AND created_at < ?",
    Date.now() - 86_400_000,
  );
}
