import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSystemHealth } from '../../lib/health/checks';
import { createR2Client } from '../../lib/media/r2-client';

const otherChecks = { database: async () => undefined, upload: async () => undefined, cdn: async () => undefined, errorRate: async () => ({ errorRate: 0, sampleSize: 100 }) };

describe('private R2 health probe', () => {
  beforeEach(() => {
    vi.stubEnv('R2_ACCOUNT_ID', 'test-account');
    vi.stubEnv('R2_ACCESS_KEY_ID', 'test-key');
    vi.stubEnv('R2_SECRET_ACCESS_KEY', 'test-secret');
    vi.stubEnv('R2_BUCKET_NAME', 'private-photos');
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

  it.each([200, 404])('reports storage healthy for an authenticated HEAD response %i', async (status) => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status }));
    vi.stubGlobal('fetch', fetch);
    const snapshot = await getSystemHealth('event-1', otherChecks);
    expect(snapshot.checks.find((item) => item.component === 'r2')?.status).toBe('ok');
    expect(snapshot.overall).toBe('ok');
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/private-photos/health-check/probe?'), expect.objectContaining({ method: 'HEAD' }));
    expect(JSON.stringify(snapshot)).not.toContain('test-secret');
  });

  it.each([401, 403, 429, 500, 503])('reports storage degraded for a real HTTP failure %i', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })));
    const snapshot = await getSystemHealth('event-1', otherChecks);
    expect(snapshot.checks.find((item) => item.component === 'r2')?.status).toBe('degraded');
    expect(snapshot.overall).toBe('degraded');
  });

  it('reports network failures as degraded', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network unavailable')));
    const snapshot = await getSystemHealth('event-1', otherChecks);
    expect(snapshot.checks.find((item) => item.component === 'r2')?.status).toBe('degraded');
  });

  it('times out a hung storage request within the existing budget', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => undefined)));
    const result = getSystemHealth('event-1', otherChecks);
    await vi.advanceTimersByTimeAsync(2500);
    expect((await result).checks.find((item) => item.component === 'r2')).toMatchObject({ status: 'degraded', timeoutMs: 2500 });
  });

  it('still rejects missing objects outside the health probe', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(createR2Client().headObject('missing-photo')).rejects.toThrow('R2_HEAD_FAILED_404');
  });
});
