import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { createDatabaseClient, type DatabaseClient } from '../db/client';
import { HttpError } from '../errors/http-error';

const MAX_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MESSAGE = 'Terlalu banyak permintaan. Coba lagi sebentar.';

export type TrustedProxyPolicy = { token: string };
export type RateLimitResult = { count: number; resetAt: string };
export type RateLimitInput = { scope: string; key: string; limit: number; windowMs: number; now?: number };
export type RateLimitStore = { consume(input: RateLimitInput): Promise<RateLimitResult> };

function configuredTrustedProxyPolicy(environment = process.env): TrustedProxyPolicy | null {
  const token = environment.RATE_LIMIT_TRUSTED_PROXY_TOKEN;
  if (!token) {
    if (environment.NODE_ENV === 'production') throw new Error('RATE_LIMIT_TRUSTED_PROXY_TOKEN is required in production');
    return null;
  }
  if (token.length < 32) throw new Error('RATE_LIMIT_TRUSTED_PROXY_TOKEN must be at least 32 characters');
  return { token };
}

function sameSecret(left: string, right: string): boolean {
  const leftValue = Buffer.from(left);
  const rightValue = Buffer.from(right);
  return leftValue.length === rightValue.length && timingSafeEqual(leftValue, rightValue);
}

export function clientRateLimitKey(request: Request, trustedProxy = configuredTrustedProxyPolicy()): string {
  const clientAddress = request.headers.get('x-invnity-client-ip');
  const proxyToken = request.headers.get('x-invnity-proxy-token');
  if (!trustedProxy || !clientAddress || !proxyToken || !sameSecret(proxyToken, trustedProxy.token) || !isIP(clientAddress.trim())) {
    return 'unknown-client';
  }
  return createHmac('sha256', trustedProxy.token).update(clientAddress.trim()).digest('hex');
}

function validateRateLimitInput(input: RateLimitInput): void {
  if (!input.scope || input.scope.length > 80 || !input.key || input.key.length > 256 || !Number.isInteger(input.limit) || input.limit < 1 || !Number.isInteger(input.windowMs) || input.windowMs < 1 || input.windowMs > MAX_WINDOW_MS) {
    throw new Error('Invalid rate-limit configuration');
  }
}

export class SupabaseRateLimitStore implements RateLimitStore {
  constructor(private readonly db: DatabaseClient | null = null) {}

  async consume(input: RateLimitInput): Promise<RateLimitResult> {
    validateRateLimitInput(input);
    return (this.db ?? createDatabaseClient()).rpc<RateLimitResult>('consume_rate_limit_bucket', {
      p_scope: input.scope,
      p_bucket_key: input.key,
      p_limit: input.limit,
      p_window_seconds: Math.ceil(input.windowMs / 1_000),
    });
  }
}

/** Deterministic adapter for tests; production always uses SupabaseRateLimitStore. */
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  async consume(input: RateLimitInput): Promise<RateLimitResult> {
    validateRateLimitInput(input);
    const now = input.now ?? Date.now();
    const bucketKey = `${input.scope}:${input.key}`;
    const current = this.buckets.get(bucketKey);
    const bucket = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + input.windowMs }
      : current;
    bucket.count += 1;
    this.buckets.set(bucketKey, bucket);
    return { count: bucket.count, resetAt: new Date(bucket.resetAt).toISOString() };
  }
}

const productionRateLimitStore = new SupabaseRateLimitStore();

export async function enforceRateLimit(scope: string, key: string, limit: number, windowMs: number, store: RateLimitStore = productionRateLimitStore, now?: number): Promise<void> {
  const bucket = await store.consume({ scope, key, limit, windowMs, now });
  if (bucket.count > limit) throw new HttpError(429, 'RATE_LIMITED', RATE_LIMIT_MESSAGE);
}
