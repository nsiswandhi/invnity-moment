import { describe, expect, it, vi } from 'vitest';
import { apiError, requestId } from '../../lib/auth/http';
import { HttpError } from '../../lib/errors/http-error';
import { applySecurityHeaders, contentSecurityPolicy } from '../../lib/security/headers';
import { redactLogFields } from '../../lib/security/redaction';
import { resolveRequestId } from '../../lib/security/request-id';

describe('security hardening', () => {
  it('uses an Edge-safe generated request id when the inbound value is unsafe', () => {
    expect(resolveRequestId('7b7dc98e-77ff-4f00-a63f-d8257e927a5d')).toBe('7b7dc98e-77ff-4f00-a63f-d8257e927a5d');
    expect(resolveRequestId('token=private')).toMatch(/^[0-9a-f-]{36}$/);
    expect(requestId(new Request('https://moments.example.test', { headers: { 'x-request-id': 'not-a-request-id' } }))).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('sets a CSP and defensive headers without blocking signed R2 images', () => {
    const headers = new Headers();
    applySecurityHeaders(headers, '7b7dc98e-77ff-4f00-a63f-d8257e927a5d', { NODE_ENV: 'production' });
    expect(contentSecurityPolicy()).toContain("img-src 'self' blob: data: https://*.r2.cloudflarestorage.com");
    expect(headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(headers.get('x-content-type-options')).toBe('nosniff');
    expect(headers.get('cross-origin-resource-policy')).toBe('same-origin');
    expect(headers.get('x-request-id')).toBe('7b7dc98e-77ff-4f00-a63f-d8257e927a5d');
    expect(headers.get('strict-transport-security')).toContain('max-age=');
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
});
