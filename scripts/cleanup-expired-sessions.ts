import { createDatabaseClient, type DatabaseClient } from '../lib/db/client';

export type CleanupReport = {
  dryRun: boolean;
  sessionsRemoved: number;
  reservationsExpired: number;
  total: number;
};

export type CleanupOptions = {
  db?: DatabaseClient;
  dryRun?: boolean;
  batchSize?: number;
  now?: Date;
};

const MAX_BATCH_SIZE = 1000;

function boundedBatchSize(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > MAX_BATCH_SIZE) throw new Error('CLEANUP_BATCH_SIZE_INVALID');
  return value;
}

export async function cleanupExpiredSessions({ db = createDatabaseClient(), dryRun = false, batchSize = 100, now = new Date() }: CleanupOptions = {}): Promise<CleanupReport> {
  const limit = boundedBatchSize(batchSize);
  const result = await db.rpc<{ sessionsRemoved?: number; reservationsExpired?: number }>('cleanup_expired_sessions', {
    p_now: now.toISOString(), p_limit: limit, p_dry_run: dryRun,
  });
  const sessionsRemoved = Number(result.sessionsRemoved ?? 0);
  const reservationsExpired = Number(result.reservationsExpired ?? 0);
  return { dryRun, sessionsRemoved, reservationsExpired, total: sessionsRemoved + reservationsExpired };
}

async function main(): Promise<void> {
  const result = await cleanupExpiredSessions({
    dryRun: process.env.CLEANUP_DRY_RUN === 'true',
    batchSize: process.env.CLEANUP_BATCH_SIZE ? Number(process.env.CLEANUP_BATCH_SIZE) : 100,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1]?.endsWith('cleanup-expired-sessions.ts')) main().catch(() => { process.stderr.write('Expired-session cleanup failed.\n'); process.exitCode = 1; });
