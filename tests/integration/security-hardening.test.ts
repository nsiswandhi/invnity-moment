import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { apiError, requestId } from '../../lib/auth/http';
import { HttpError } from '../../lib/errors/http-error';
import { applySecurityHeaders, contentSecurityPolicy } from '../../lib/security/headers';
import { redactLogFields, safeLog } from '../../lib/security/redaction';
import { resolveRequestId } from '../../lib/security/request-id';
import { middleware } from '../../middleware';

describe('security hardening', () => {
  it('uses an Edge-safe generated request id when the inbound value is unsafe', () => {
    expect(resolveRequestId('7b7dc98e-77ff-4f00-a63f-d8257e927a5d')).toBe('7b7dc98e-77ff-4f00-a63f-d8257e927a5d');
    expect(resolveRequestId('token=private')).toMatch(/^[0-9a-f-]{36}$/);
    expect(requestId(new Request('https://moments.example.test', { headers: { 'x-request-id': 'not-a-request-id' } }))).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('sets a CSP and defensive headers without blocking signed R2 images', () => {
    const headers = new Headers();
    applySecurityHeaders(headers, '7b7dc98e-77ff-4f00-a63f-d8257e927a5d', { NODE_ENV: 'production' }, 'test-csp-nonce');
    expect(contentSecurityPolicy()).toContain("img-src 'self' blob: data: https://*.r2.cloudflarestorage.com");
    expect(headers.get('content-security-policy')).toContain("script-src 'self' 'nonce-test-csp-nonce'");
    expect(headers.get('content-security-policy')).toContain("style-src 'self' 'nonce-test-csp-nonce'");
    expect(headers.get('content-security-policy')).not.toContain("'unsafe-inline'");
    expect(headers.get('x-content-type-options')).toBe('nosniff');
    expect(headers.get('cross-origin-resource-policy')).toBe('same-origin');
    expect(headers.get('x-request-id')).toBe('7b7dc98e-77ff-4f00-a63f-d8257e927a5d');
    expect(headers.get('strict-transport-security')).toContain('max-age=');
  });

  it('allows Next development eval only outside production', () => {
    expect(contentSecurityPolicy('dev-nonce', { NODE_ENV: 'development' })).toContain("'unsafe-eval'");
    expect(contentSecurityPolicy('prod-nonce', { NODE_ENV: 'production' })).not.toContain("'unsafe-eval'");
  });

  it('forwards the exact nonce-bearing CSP policy to both Next request and response', () => {
    const response = middleware(new NextRequest('https://moments.example.test/'));
    const policy = response.headers.get('content-security-policy');
    const nonce = policy?.match(/'nonce-([^']+)'/)?.[1];

    expect(policy).toMatch(/script-src 'self'(?: 'unsafe-eval')? 'nonce-/);
    expect(nonce).toEqual(expect.any(String));
    expect(response.headers.get('x-middleware-request-content-security-policy')).toBe(policy);
    expect(response.headers.get('x-middleware-request-x-nonce')).toBe(nonce);
  });

  it('redacts secrets before safe structured logs and safe error responses', async () => {
    expect(redactLogFields({ email: 'private@example.test', accessToken: 'secret', downloadUrl: 'https://bucket.test/?X-Amz-Signature=secret', reason: 'network' })).toEqual({
      email: '[REDACTED]', accessToken: '[REDACTED]', downloadUrl: '[REDACTED]', reason: 'network',
    });
    const response = apiError(new Error('Authorization: Bearer private'), '7b7dc98e-77ff-4f00-a63f-d8257e927a5d');
    expect(await response.json()).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Terjadi gangguan. Silakan coba lagi.' }, request_id: '7b7dc98e-77ff-4f00-a63f-d8257e927a5d' });
    expect(response.headers.get('x-request-id')).toBe('7b7dc98e-77ff-4f00-a63f-d8257e927a5d');
    expect(apiError(new HttpError(429, 'RATE_LIMITED', 'Terlalu banyak permintaan.'), 'id').status).toBe(429);
  });

  it('never writes arbitrary secret-bearing error text to structured logs', () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    safeLog('request_failed', { reason: 'Authorization failed for private-credential' });
    apiError(new Error('access token private-credential'), '7b7dc98e-77ff-4f00-a63f-d8257e927a5d');

    const output = log.mock.calls.flat().join('\n');
    expect(output).not.toContain('private-credential');
    expect(output).not.toContain('access token');
    expect(JSON.parse(String(log.mock.calls[1][0]))).toEqual({
      event: 'api_error',
      requestId: '7b7dc98e-77ff-4f00-a63f-d8257e927a5d',
      errorCode: 'UNEXPECTED',
    });
    log.mockRestore();
  });
});
