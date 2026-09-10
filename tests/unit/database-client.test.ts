import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseClient } from '../../lib/db/client';
import { HttpError } from '../../lib/errors/http-error';

const environment: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  SUPABASE_URL: 'https://database.example.test/',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('raw PostgREST RPC adapter', () => {
  it.each([
    ['a scalar', 42],
    ['an array', [{ id: 'delivery-1' }, { id: 'delivery-2' }]],
    ['an object', { id: 'participant-1', status: 'active' }],
  ])('returns a direct %s response body', async (_label, payload) => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(payload));
    vi.stubGlobal('fetch', fetch);

    const result = await createDatabaseClient(environment).rpc('example_rpc', { p_value: 'value' });

    expect(result).toEqual(payload);
    expect(fetch).toHaveBeenCalledWith('https://database.example.test/rest/v1/rpc/example_rpc', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ p_value: 'value' }),
    }));
  });

  it('maps a direct PostgREST error body to the expected typed database HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      code: 'PARTICIPANT_EXISTS',
      message: 'PARTICIPANT_EXISTS',
      details: 'existing participant',
      hint: 'use recovery',
    }, 409)));

    const error = await createDatabaseClient(environment).rpc('register_participant_for_event', {}).catch((value: unknown) => value);

    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status: 409, code: 'RECOVERY_REQUIRED' });
  });

  it('maps an unrecognised direct PostgREST error body to the opaque database-unavailable error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      code: 'PGRST999',
      message: 'unexpected database failure',
      details: 'internal schema detail',
      hint: 'do not expose this',
    }, 500)));

    const error = await createDatabaseClient(environment).rpc('example_rpc', {}).catch((value: unknown) => value);

    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status: 503, code: 'DATABASE_UNAVAILABLE' });
  });

  it.each(['message', 'detail', 'details', 'hint'])('maps P0001 cursor errors carried in %s through the RPC adapter', async (field) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      code: 'P0001',
      message: 'Album pagination rejected',
      details: null,
      hint: null,
      [field]: 'INVALID_CURSOR',
    }, 400)));

    await expect(createDatabaseClient(environment).rpc('list_published_moments', {}))
      .rejects.toMatchObject({ status: 400, code: 'INVALID_CURSOR' });
  });

  it.each([
    { code: 'PGRST999', message: 'INVALID_CURSOR', details: null, hint: null },
    { code: 'XX000', message: 'Internal failure', details: 'INVALID_CURSOR', hint: null },
    { code: 'P0001', message: 'UNRELATED_DOMAIN_ERROR', details: null, hint: null },
    { code: 'P0001', message: 'NOT_INVALID_CURSOR', details: null, hint: null },
  ])('keeps unrelated database errors opaque: $code / $message', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body, 500)));

    await expect(createDatabaseClient(environment).rpc('list_published_moments', {}))
      .rejects.toMatchObject({ status: 503, code: 'DATABASE_UNAVAILABLE' });
  });
});
