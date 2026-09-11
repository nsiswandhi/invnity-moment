import { describe, expect, it, vi } from 'vitest';
import { assertTrustedMutation } from '../../lib/auth/csrf';

describe('CSRF protection', () => {
  it('requires a matching CSRF token for a cookie-authenticated admin mutation', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://moments.example.test');
    const request = new Request('https://moments.example.test/api/v1/admin/event-mode', {
      method: 'PATCH',
      headers: { cookie: 'invnity_admin_session=operator-session; invnity_csrf=csrf-token' },
    });

    expect(() => assertTrustedMutation(request)).toThrow(expect.objectContaining({ status: 403, code: 'CSRF_REJECTED' }));
  });
});
