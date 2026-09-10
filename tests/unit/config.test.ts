import { describe, expect, it, vi } from 'vitest';
import { getPublicConfig, getServerConfig } from '../../lib/config';

describe('configuration', () => {
  it.each([
    ['R2_ACCOUNT_ID', 'account'],
    ['R2_ACCESS_KEY_ID', 'access'],
    ['R2_SECRET_ACCESS_KEY', 'secret'],
    ['R2_BUCKET_NAME', 'bucket'],
    ['SESSION_SECRET', 'session'],
  ])('rejects production configuration when %s is missing', (missingKey) => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('R2_ACCOUNT_ID', 'account');
    vi.stubEnv('R2_ACCESS_KEY_ID', 'access');
    vi.stubEnv('R2_SECRET_ACCESS_KEY', 'secret');
    vi.stubEnv('R2_BUCKET_NAME', 'bucket');
    vi.stubEnv('SESSION_SECRET', 'session-secret-value-that-is-long-enough');
    vi.stubEnv(missingKey, '');

    expect(() => getServerConfig()).toThrow();
    vi.unstubAllEnvs();
  });

  it('exposes only safe browser configuration', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
    vi.stubEnv('SESSION_SECRET', 'private');
    vi.stubEnv('R2_SECRET_ACCESS_KEY', 'private');

    const config = getPublicConfig();
    expect(config).toEqual({ appUrl: 'http://localhost:3000' });
    expect(JSON.stringify(config)).not.toContain('private');
    vi.unstubAllEnvs();
  });
});
