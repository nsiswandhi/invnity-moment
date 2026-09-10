import { describe, expect, it, vi } from 'vitest';
import { HttpError } from '../../lib/errors/http-error';
import {
  InMemoryRateLimitStore,
  SupabaseRateLimitStore,
  clientRateLimitKey,
  enforceRateLimit,
} from '../../lib/auth/rate-limits';
import type { DatabaseClient } from '../../lib/db/client';

const trustedProxy = { token: 'a-trusted-proxy-token-that-is-long-enough' };

describe('client rate-limit identity', () => {
  it('ignores spoofed forwarded addresses unless the trusted proxy authenticates the client address', () => {
    const spoofed = new Request('https://moments.example.test/api/v1/access-recovery', {
      headers: { 'x-forwarded-for': '198.51.100.99', 'cf-connecting-ip': '198.51.100.99' },
    });
    const trusted = new Request('https://moments.example.test/api/v1/access-recovery', {
      headers: {
        'x-forwarded-for': '198.51.100.99',
        'x-invnity-client-ip': '203.0.113.44',
        'x-invnity-proxy-token': trustedProxy.token,
      },
    });

    expect(clientRateLimitKey(spoofed, trustedProxy)).toBe('unknown-client');
    expect(clientRateLimitKey(trusted, trustedProxy)).not.toContain('198.51.100.99');
    expect(clientRateLimitKey(trusted, trustedProxy)).not.toContain('203.0.113.44');
    expect(clientRateLimitKey(trusted, trustedProxy)).not.toBe('unknown-client');
  });
});

describe('rate-limit stores', () => {
  it('shares a bucket across callers and expires it deterministically', async () => {
    const store = new InMemoryRateLimitStore();

    await expect(enforceRateLimit('recovery', 'participant-key', 2, 1_000, store, 0)).resolves.toBeUndefined();
    await expect(enforceRateLimit('recovery', 'participant-key', 2, 1_000, store, 1)).resolves.toBeUndefined();
    await expect(enforceRateLimit('recovery', 'participant-key', 2, 1_000, store, 2))
      .rejects.toMatchObject({ status: 429, code: 'RATE_LIMITED' } satisfies Partial<HttpError>);
    await expect(enforceRateLimit('recovery', 'participant-key', 2, 1_000, store, 1_000)).resolves.toBeUndefined();
  });

  it('uses the shared Supabase bucket RPC rather than process-local state', async () => {
    const rpc = vi.fn().mockResolvedValue({ count: 1, resetAt: '2026-09-10T00:01:00.000Z' });
    const store = new SupabaseRateLimitStore({ rpc } as DatabaseClient);

    await expect(store.consume({ scope: 'registration', key: 'opaque-key', limit: 8, windowMs: 60_000 })).resolves.toEqual({ count: 1, resetAt: '2026-09-10T00:01:00.000Z' });
    expect(rpc).toHaveBeenCalledWith('consume_rate_limit_bucket', {
      p_scope: 'registration',
      p_bucket_key: 'opaque-key',
      p_limit: 8,
      p_window_seconds: 60,
    });
  });
});
