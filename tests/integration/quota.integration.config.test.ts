import { describe, expect, it } from 'vitest';

import { resolveQuotaIntegrationConfig } from './quota.integration.config';

describe('quota integration target safety', () => {
  it('enables writes only for an explicitly local target with a service key', () => {
    expect(resolveQuotaIntegrationConfig({
      SUPABASE_ENV: 'local',
      SUPABASE_URL: 'http://localhost:54321/',
      SUPABASE_SERVICE_ROLE_KEY: 'local-service-key',
    })).toEqual({
      kind: 'ready',
      serviceRoleKey: 'local-service-key',
      supabaseUrl: 'http://localhost:54321',
    });
  });

  it('skips with configuration guidance when the local target is absent', () => {
    expect(resolveQuotaIntegrationConfig({})).toEqual({
      kind: 'skip',
      reason: 'requires SUPABASE_ENV=local, a localhost or 127.0.0.1 SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY',
    });
  });

  it('refuses a non-local Supabase URL before any integration write can run', () => {
    expect(() => resolveQuotaIntegrationConfig({
      SUPABASE_ENV: 'local',
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    })).toThrow('Refusing quota integration database writes: SUPABASE_URL must target localhost or 127.0.0.1.');
  });

  it('refuses an explicitly non-local environment before any integration write can run', () => {
    expect(() => resolveQuotaIntegrationConfig({
      SUPABASE_ENV: 'staging',
      SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    })).toThrow('Refusing quota integration database writes: SUPABASE_ENV must be exactly "local".');
  });
});
