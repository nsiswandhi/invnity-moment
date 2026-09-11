import 'server-only';
import { checkAdminDatabase, getAdminErrorRate } from '../db/repositories/admin';
import { createR2Client } from '../media/r2-client';
import { getPublicConfig } from '../config';

export type HealthStatus = 'ok' | 'degraded' | 'unknown';
export type HealthComponent = 'application' | 'database' | 'r2' | 'upload' | 'cdn' | 'error_rate';
export type HealthCheck = { component: HealthComponent; status: HealthStatus; label: string; latencyMs: number; timeoutMs: number };
export type SystemHealthSnapshot = { checkedAt: string; overall: HealthStatus; checks: HealthCheck[] };
export type HealthDependencies = { database?: () => Promise<void>; r2?: () => Promise<void>; upload?: () => Promise<void>; cdn?: () => Promise<void>; errorRate?: () => Promise<{ errorRate: number | null; sampleSize: number }> };

const budgets: Record<HealthComponent, number> = { application: 250, database: 2_000, r2: 2_500, upload: 1_000, cdn: 2_000, error_rate: 2_000 };

async function withTimeout<T>(work: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error('HEALTH_TIMEOUT')), timeoutMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function check(component: HealthComponent, label: string, work: () => Promise<void>): Promise<HealthCheck> {
  const startedAt = Date.now();
  try {
    await withTimeout(work, budgets[component]);
    return { component, status: 'ok', label, latencyMs: Date.now() - startedAt, timeoutMs: budgets[component] };
  } catch {
    return { component, status: 'degraded', label, latencyMs: Date.now() - startedAt, timeoutMs: budgets[component] };
  }
}

export async function getSystemHealth(eventId: string, dependencies: HealthDependencies = {}): Promise<SystemHealthSnapshot> {
  const r2 = createR2Client;
  const errorRateCheck = async () => {
    const value = await (dependencies.errorRate ? dependencies.errorRate() : getAdminErrorRate(eventId));
    if (value.errorRate !== null && value.errorRate > 0.1) throw new Error('ERROR_RATE_HIGH');
  };
  const checks = await Promise.all([
    check('application', 'Aplikasi', async () => undefined),
    check('database', 'Database', dependencies.database ?? checkAdminDatabase),
    check('r2', 'Penyimpanan foto', dependencies.r2 ?? (async () => { try { await r2().headObject('health-check/probe'); } catch (error) { if (!(error instanceof Error) || !error.message.endsWith('_404')) throw error; } })),
    check('upload', 'Otorisasi upload', dependencies.upload ?? (async () => { await r2().presignPut('health-check/probe', { contentType: 'image/jpeg', expiresInSeconds: 60 }); })),
    check('cdn', 'Pengiriman foto', dependencies.cdn ?? (async () => { const response = await fetch(getPublicConfig().appUrl, { method: 'HEAD', cache: 'no-store' }); if (!response.ok) throw new Error('CDN_UNAVAILABLE'); })),
    check('error_rate', 'Tingkat error', errorRateCheck),
  ]);
  const overall: HealthStatus = checks.some((item) => item.status === 'degraded') ? 'degraded' : 'ok';
  return { checkedAt: new Date().toISOString(), overall, checks };
}
