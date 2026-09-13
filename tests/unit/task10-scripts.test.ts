import { describe, expect, it, vi } from 'vitest';

type CleanupModule = { cleanupExpiredSessions?: (options: Record<string, unknown>) => Promise<Record<string, unknown>> };
type ReconcileModule = { reconcileR2Objects?: (options: Record<string, unknown>) => Promise<Record<string, unknown>> };
type AggregateModule = { aggregateAnalytics?: (options: Record<string, unknown>) => Promise<Record<string, unknown>> };
type SmokeModule = { runProductionSmokeTest?: (baseUrl: string, fetcher?: typeof fetch) => Promise<Record<string, unknown>> };
type SeedModule = { seedProductionEvent?: (options: Record<string, unknown>) => Promise<Record<string, unknown>> };

async function load<T>(path: string): Promise<T | null> {
  try { return await import(path) as T; } catch { return null; }
}

describe('Task 10 operational scripts', () => {
  it('cleans expired sessions and reservations through a bounded dry-run RPC', async () => {
    const script = await load<CleanupModule>('../../scripts/cleanup-expired-sessions');
    expect(script?.cleanupExpiredSessions).toEqual(expect.any(Function));
    if (!script?.cleanupExpiredSessions) return;
    const rpc = vi.fn().mockResolvedValue({ sessionsRemoved: 2, reservationsExpired: 3 });

    const report = await script.cleanupExpiredSessions({ db: { rpc }, dryRun: true, batchSize: 25, now: new Date('2026-10-10T00:00:00.000Z') });

    expect(rpc).toHaveBeenCalledWith('cleanup_expired_sessions', { p_now: '2026-10-10T00:00:00.000Z', p_limit: 25, p_dry_run: true });
    expect(report).toMatchObject({ dryRun: true, sessionsRemoved: 2, reservationsExpired: 3 });
  });

  it('reports R2 orphans without deleting them during a dry run', async () => {
    const script = await load<ReconcileModule>('../../scripts/reconcile-r2-objects');
    expect(script?.reconcileR2Objects).toEqual(expect.any(Function));
    if (!script?.reconcileR2Objects) return;
    const rpc = vi.fn().mockResolvedValue({ data: [{ key: 'events/event-1/expected' }], nextCursor: null });
    const listObjects = vi.fn().mockResolvedValue({ objects: [{ key: 'events/event-1/expected' }, { key: 'events/event-1/orphan' }], nextCursor: null });
    const deleteObject = vi.fn();

    const report = await script.reconcileR2Objects({
      db: { rpc }, r2: { listObjects, deleteObject }, eventId: 'event-1', dryRun: true, batchSize: 10, maxObjects: 100,
    });

    expect(listObjects).toHaveBeenCalledWith({ prefix: 'events/event-1/', maxKeys: 10, continuationToken: undefined });
    expect(deleteObject).not.toHaveBeenCalled();
    expect(report).toMatchObject({ dryRun: true, scanned: 2, expected: 1, orphaned: ['events/event-1/orphan'], deleted: 0 });
  });

  it('aggregates existing analytics summaries without writing data', async () => {
    const script = await load<AggregateModule>('../../scripts/aggregate-analytics');
    expect(script?.aggregateAnalytics).toEqual(expect.any(Function));
    if (!script?.aggregateAnalytics) return;
    const source = {
      getFunnelSummary: vi.fn().mockResolvedValue({ galleryViews: 4 }),
      getSponsorSummary: vi.fn().mockResolvedValue({ views: 2, clicks: 1, ctr: 50 }),
    };

    const report = await script.aggregateAnalytics({ eventId: 'event-1', source, now: new Date('2026-10-10T00:00:00.000Z') });

    expect(source.getFunnelSummary).toHaveBeenCalledWith('event-1');
    expect(source.getSponsorSummary).toHaveBeenCalledWith('event-1');
    expect(report).toMatchObject({ eventId: 'event-1', funnel: { galleryViews: 4 }, sponsor: { views: 2, clicks: 1, ctr: 50 } });
  });

  it('does not claim production smoke success when the target is unreachable', async () => {
    const script = await load<SmokeModule>('../../scripts/smoke-production');
    expect(script?.runProductionSmokeTest).toEqual(expect.any(Function));
    if (!script?.runProductionSmokeTest) return;
    const fetcher = vi.fn().mockRejectedValue(new Error('target unavailable'));

    const report = await script.runProductionSmokeTest('https://staging.example.test', fetcher);

    expect(fetcher).toHaveBeenCalled();
    expect(report).toMatchObject({ reachable: false, passed: false });
  });

  it('supports an explicit dry-run production seed without calling the database', async () => {
    const script = await load<SeedModule>('../../scripts/seed-production-event');
    expect(script?.seedProductionEvent).toEqual(expect.any(Function));
    if (!script?.seedProductionEvent) return;
    const rpc = vi.fn();

    const report = await script.seedProductionEvent({ db: { rpc }, slug: 'reuni-akbar-2026', name: 'Reuni Akbar', eventDate: '2026-10-10', dryRun: true });

    expect(rpc).not.toHaveBeenCalled();
    expect(report).toMatchObject({ dryRun: true, seeded: false, slug: 'reuni-akbar-2026' });
  });
});
