import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from '../../lib/errors/http-error';

const { assertAdminAccessToken, assertTrustedMutation, clientRateLimitKey, createAdminSessionCookie, createCsrfCookie, enforceRateLimit, getAdminByEmail } = vi.hoisted(() => ({
  assertAdminAccessToken: vi.fn(),
  assertTrustedMutation: vi.fn(),
  clientRateLimitKey: vi.fn().mockReturnValue('operator-client'),
  createAdminSessionCookie: vi.fn().mockReturnValue({ name: 'invnity_admin_session', value: 'signed-session', httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: 43_200 }),
  createCsrfCookie: vi.fn().mockReturnValue({ name: 'invnity_csrf', value: 'csrf-token', httpOnly: false, secure: true, sameSite: 'lax', path: '/', maxAge: 43_200 }),
  enforceRateLimit: vi.fn(),
  getAdminByEmail: vi.fn(),
}));

vi.mock('../../lib/auth/admin', () => ({ assertAdminAccessToken, createAdminSessionCookie }));
vi.mock('../../lib/auth/csrf', () => ({ assertTrustedMutation, createCsrfCookie }));
vi.mock('../../lib/auth/rate-limits', () => ({ clientRateLimitKey, enforceRateLimit }));
vi.mock('../../lib/db/repositories/admin', () => ({ getAdminByEmail }));

import { POST } from '../../app/api/v1/admin/session/route';

describe('admin session route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enforceRateLimit.mockResolvedValue(undefined);
    getAdminByEmail.mockResolvedValue({ id: '16a8a4d1-226a-4571-9898-4c907d9f10ab', email: 'operator@example.test' });
  });

  it('creates an HttpOnly operator session after the access token and active operator are validated', async () => {
    const response = await POST(new Request('https://moments.example.test/api/v1/admin/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'operator@example.test', accessToken: 'operator-token' }) }));

    expect(response.status).toBe(200);
    expect(assertAdminAccessToken).toHaveBeenCalledWith('operator-token');
    expect(getAdminByEmail).toHaveBeenCalledWith('operator@example.test');
    expect(response.headers.get('set-cookie')).toContain('invnity_admin_session=signed-session');
  });

  it('keeps failed login responses generic and does not set a session', async () => {
    assertAdminAccessToken.mockImplementationOnce(() => { throw new HttpError(401, 'ADMIN_UNAUTHENTICATED', 'Akses operator tidak tersedia.'); });
    const response = await POST(new Request('https://moments.example.test/api/v1/admin/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'operator@example.test', accessToken: 'bad-token' }) }));

    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(getAdminByEmail).not.toHaveBeenCalled();
  });
});
