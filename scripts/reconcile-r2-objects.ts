import { createDatabaseClient, type DatabaseClient } from '../lib/db/client';
import { getPublicEventConfig } from '../lib/event-config';
import { createR2Client, type R2Client } from '../lib/media/r2-client';

type ExpectedObjectPage = { data?: Array<{ key?: unknown }>; nextCursor?: string | null };
type ExpectedObjectSource = Pick<DatabaseClient, 'rpc'>;
type ReconciliationStorage = Pick<R2Client, 'listObjects' | 'deleteObject'>;

export type ReconciliationReport = {
  eventId: string;
  dryRun: boolean;
  scanned: number;
  expected: number;
  orphaned: string[];
  deleted: number;
  failed: string[];
  truncated: boolean;
};

export type ReconciliationOptions = {
  eventId?: string;
  dryRun?: boolean;
  batchSize?: number;
  maxObjects?: number;
  db?: ExpectedObjectSource;
  r2?: ReconciliationStorage;
};

const MAX_BATCH_SIZE = 1000;
const DEFAULT_MAX_OBJECTS = 1000;

function bounded(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1 || value > MAX_BATCH_SIZE) throw new Error(`${name}_INVALID`);
  return value;
}

async function expectedKeys(db: ExpectedObjectSource, eventId: string, batchSize: number, maxObjects: number): Promise<{ keys: Set<string>; truncated: boolean }> {
  const keys = new Set<string>();
  let cursor: string | undefined;
  while (keys.size < maxObjects) {
    const page = await db.rpc<ExpectedObjectPage>('list_expected_r2_objects', { p_event_id: eventId, p_cursor: cursor, p_limit: Math.min(batchSize, maxObjects - keys.size) });
    for (const item of page.data ?? []) if (typeof item.key === 'string' && item.key.length > 0) keys.add(item.key);
    if (!page.nextCursor) return { keys, truncated: false };
    cursor = page.nextCursor;
  }
  return { keys, truncated: true };
}

export async function reconcileR2Objects({ eventId = getPublicEventConfig().eventId, dryRun = true, batchSize = 100, maxObjects = DEFAULT_MAX_OBJECTS, db = createDatabaseClient(), r2 = createR2Client() }: ReconciliationOptions = {}): Promise<ReconciliationReport> {
  if (!eventId) throw new Error('RECONCILE_EVENT_ID_REQUIRED');
  const limit = bounded(batchSize, 'RECONCILE_BATCH_SIZE');
  const maximum = bounded(maxObjects, 'RECONCILE_MAX_OBJECTS');
  const expected = await expectedKeys(db, eventId, limit, maximum);
  const objects = new Set<string>();
  let continuationToken: string | undefined;
  let truncated = expected.truncated;
  while (objects.size < maximum) {
    const page = await r2.listObjects({ prefix: `events/${eventId}/`, maxKeys: Math.min(limit, maximum - objects.size), continuationToken });
    for (const object of page.objects) objects.add(object.key);
    if (!page.nextCursor) break;
    continuationToken = page.nextCursor;
    if (objects.size >= maximum) truncated = true;
  }
  const orphaned = [...objects].filter((key) => !expected.keys.has(key)).sort();
  const failed: string[] = [];
  let deleted = 0;
  if (!dryRun && !truncated) {
    for (const key of orphaned) {
      try { await r2.deleteObject(key); deleted += 1; } catch { failed.push(key); }
    }
  }
  return { eventId, dryRun, scanned: objects.size, expected: expected.keys.size, orphaned, deleted, failed, truncated };
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--apply') ? false : process.env.RECONCILE_DRY_RUN !== 'false';
  const result = await reconcileR2Objects({ dryRun, maxObjects: process.env.RECONCILE_MAX_OBJECTS ? Number(process.env.RECONCILE_MAX_OBJECTS) : DEFAULT_MAX_OBJECTS });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.failed.length > 0 || result.truncated) process.exitCode = 2;
}

if (process.argv[1]?.endsWith('reconcile-r2-objects.ts')) main().catch(() => { process.stderr.write('R2 reconciliation failed.\n'); process.exitCode = 1; });
