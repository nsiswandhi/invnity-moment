import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from '../../lib/errors/http-error';

const { clientRateLimitKey, consumeRecoveryToken, createDatabaseClient, createParticipantSession, enforceRateLimit, getSessionTokenHash, queueRecoveryRequest, requireParticipant } = vi.hoisted(() => ({
  clientRateLimitKey: vi.fn().mockReturnValue('opaque-rate-key'),
  consumeRecoveryToken: vi.fn(),
  createDatabaseClient: vi.fn(),
  createParticipantSession: vi.fn(),
  enforceRateLimit: vi.fn(),
  getSessionTokenHash: vi.fn(),
  queueRecoveryRequest: vi.fn(),
  requireParticipant: vi.fn(),
}));

vi.mock('../../lib/auth/session', () => ({
  SESSION_COOKIE_NAME: 'invnity_session',
  createParticipantSession,
  getSessionTokenHash,
  requireParticipant,
}));
vi.mock('../../lib/auth/recovery', () => ({ consumeRecoveryToken }));
vi.mock('../../lib/recovery/recovery-request', () => ({ queueRecoveryRequest }));
vi.mock('../../lib/auth/rate-limits', () => ({ clientRateLimitKey, enforceRateLimit }));
vi.mock('../../lib/db/client', () => ({ createDatabaseClient }));

import { POST as register } from '../../app/api/v1/events/[event]/participants/route';
import { POST as requestRecovery } from '../../app/api/v1/access-recovery/route';
import { POST as consumeRecovery } from '../../app/api/v1/access-recovery/consume/route';
import { GET as getMe } from '../../app/api/v1/me/route';
import { POST as revoke } from '../../app/api/v1/session/revoke/route';

describe('authentication routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enforceRateLimit.mockResolvedValue(undefined);
    queueRecoveryRequest.mockResolvedValue(undefined);
  });

  it('returns a stable validation error without echoing submitted email', async () => {
    const response = await register(new Request('https://moments.example.test/api/v1/events/reuni/participants', {
      method: 'POST', body: JSON.stringify({ name: 'Sari', batch: '', email: 'private@example.test' }), headers: { 'content-type': 'application/json' },
    }), { params: Promise.resolve({ event: 'reuni' }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ error: { code: 'VALIDATION_ERROR' }, request_id: expect.any(String) });
    expect(JSON.stringify(body)).not.toContain('private@example.test');
  });

  it('acknowledges recovery requests identically to prevent email enumeration', async () => {
    const makeRequest = (email: string) => requestRecovery(new Request('https://moments.example.test/api/v1/access-recovery', {
      method: 'POST', body: JSON.stringify({ event: 'bd928dad-a8c6-40af-a482-30df35ad5e5b', email }), headers: { 'content-type': 'application/json' },
    }));

    const [first, second] = await Promise.all([makeRequest('sari@example.test'), makeRequest('unknown@example.test')]);
    const [firstBody, secondBody] = await Promise.all([first.json(), second.json()]);
    expect(firstBody.data).toEqual(secondBody.data);
    expect(firstBody.request_id).toEqual(expect.any(String));
    expect(secondBody.request_id).toEqual(expect.any(String));
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(queueRecoveryRequest).toHaveBeenCalledTimes(2);
    expect(queueRecoveryRequest).toHaveBeenCalledWith(expect.objectContaining({ email: 'sari@example.test', eventId: 'bd928dad-a8c6-40af-a482-30df35ad5e5b' }));
    expect(queueRecoveryRequest).toHaveBeenCalledWith(expect.objectContaining({ email: 'unknown@example.test', eventId: 'bd928dad-a8c6-40af-a482-30df35ad5e5b' }));
  });

  it('rejects a cross-origin cookie mutation before registration work starts', async () => {
    const response = await register(new Request('https://moments.example.test/api/v1/events/reuni/participants', {
      method: 'POST',
      body: JSON.stringify({ name: 'Sari', batch: 'IA 5', email: 'sari@example.test' }),
      headers: { 'content-type': 'application/json', origin: 'https://attacker.example.test' },
    }), { params: Promise.resolve({ event: 'reuni' }) });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'CSRF_REJECTED' }, request_id: expect.any(String) });
    expect(enforceRateLimit).not.toHaveBeenCalled();
  });

  it('rejects a cookie-authenticated mutation without its matching CSRF token', async () => {
    const response = await register(new Request('https://moments.example.test/api/v1/events/reuni/participants', {
      method: 'POST',
      body: JSON.stringify({ name: 'Sari', batch: 'IA 5', email: 'sari@example.test' }),
      headers: { 'content-type': 'application/json', cookie: 'invnity_session=session-token; invnity_csrf=csrf-token' },
    }), { params: Promise.resolve({ event: 'reuni' }) });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'CSRF_REJECTED' }, request_id: expect.any(String) });
    expect(enforceRateLimit).not.toHaveBeenCalled();
  });

  it('maps a shared rate-limit refusal to 429', async () => {
    enforceRateLimit.mockRejectedValueOnce(new HttpError(429, 'RATE_LIMITED', 'Terlalu banyak permintaan. Coba lagi sebentar.'));

    const response = await register(new Request('https://moments.example.test/api/v1/events/reuni/participants', {
      method: 'POST',
      body: JSON.stringify({ name: 'Sari', batch: 'IA 5', email: 'sari@example.test' }),
      headers: { 'content-type': 'application/json' },
    }), { params: Promise.resolve({ event: 'reuni' }) });

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: { code: 'RATE_LIMITED' }, request_id: expect.any(String) });
  });

  it('does not create a session when an unauthenticated registration email already belongs to someone', async () => {
    createDatabaseClient.mockReturnValue({
      rpc: vi.fn().mockRejectedValue(Object.assign(new Error('PARTICIPANT_EXISTS'), { code: 'PARTICIPANT_EXISTS' })),
    });

    const response = await register(new Request('https://moments.example.test/api/v1/events/reuni/participants', {
      method: 'POST',
      body: JSON.stringify({ name: 'Mallory', batch: 'IA 5', email: 'sari@example.test' }),
      headers: { 'content-type': 'application/json' },
    }), { params: Promise.resolve({ event: 'reuni' }) });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'RECOVERY_REQUIRED' }, request_id: expect.any(String) });
    expect(createParticipantSession).not.toHaveBeenCalled();
  });

  it('resumes an identity only through a valid existing session without minting another one', async () => {
    const participant = { id: 'participant-1', eventId: 'event-1', name: 'Sari Wijaya', batch: 'IA 5', status: 'active' };
    getSessionTokenHash.mockReturnValue('session-token-hash');
    requireParticipant.mockResolvedValue(participant);
    createDatabaseClient.mockReturnValue({
      rpc: vi.fn().mockResolvedValue(participant),
    });

    const response = await register(new Request('https://moments.example.test/api/v1/events/reuni/participants', {
      method: 'POST',
      body: JSON.stringify({ name: 'Mallory', batch: 'IA 5', email: 'sari@example.test' }),
      headers: {
        'content-type': 'application/json',
        cookie: 'invnity_session=valid-session; invnity_csrf=csrf-token',
        'x-csrf-token': 'csrf-token',
      },
    }), { params: Promise.resolve({ event: 'reuni' }) });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { participant: { id: 'participant-1', name: 'Sari Wijaya' }, resumed: true }, request_id: expect.any(String) });
    expect(createDatabaseClient().rpc).toHaveBeenCalledWith('resume_participant_for_event', {
      p_event_slug: 'reuni', p_participant_id: 'participant-1', p_session_token_hash: 'session-token-hash',
    });
    expect(createParticipantSession).not.toHaveBeenCalled();
  });

  it('revokes the current session and clears its cookie', async () => {
    const rpc = vi.fn().mockResolvedValue(undefined);
    createDatabaseClient.mockReturnValue({ rpc });
    requireParticipant.mockResolvedValue({ id: 'participant-1', eventId: 'event-1', name: 'Sari', batch: 'IA 5', status: 'active' });
    getSessionTokenHash.mockReturnValue('session-token-hash');

    const response = await revoke(new Request('https://moments.example.test/api/v1/session/revoke', {
      method: 'POST',
      headers: { cookie: 'invnity_session=session-token; invnity_csrf=csrf-token', 'x-csrf-token': 'csrf-token' },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { revoked: true }, request_id: expect.any(String) });
    expect(rpc).toHaveBeenCalledWith('revoke_access_session', { p_session_token_hash: 'session-token-hash' });
    expect(response.headers.get('set-cookie')).toMatch(/invnity_session=.*Max-Age=0/i);
  });

  it('returns the authenticated participant and quota from /me', async () => {
    const rpc = vi.fn().mockResolvedValue({ activeMoments: 3, maxActiveMoments: 10 });
    createDatabaseClient.mockReturnValue({ rpc });
    requireParticipant.mockResolvedValue({ id: 'participant-1', eventId: 'event-1', name: 'Sari', batch: 'IA 5', status: 'active' });

    const response = await getMe(new Request('https://moments.example.test/api/v1/me'));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { participant: { id: 'participant-1', eventId: 'event-1', name: 'Sari', batch: 'IA 5' }, quota: { activeMoments: 3, maxActiveMoments: 10 } },
      request_id: expect.any(String),
    });
  });

  it('rotates a session after consuming a valid recovery token', async () => {
    const participant = { id: 'participant-1', eventId: 'event-1', name: 'Sari', batch: 'IA 5', status: 'active' };
    consumeRecoveryToken.mockResolvedValue(participant);
    createParticipantSession.mockResolvedValue({
      participant: { id: 'participant-1', eventId: 'event-1', name: 'Sari', batch: 'IA 5' },
      expiresAt: '2026-10-10T00:00:00.000Z',
      cookie: { name: 'invnity_session', value: 'rotated-session-token', httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 },
    });

    const response = await consumeRecovery(new Request('https://moments.example.test/api/v1/access-recovery/consume', {
      method: 'POST',
      body: JSON.stringify({ token: 'a-very-long-recovery-token' }),
      headers: { 'content-type': 'application/json' },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { participant: { id: 'participant-1' }, expires_at: '2026-10-10T00:00:00.000Z' }, request_id: expect.any(String) });
    expect(createParticipantSession).toHaveBeenCalledWith({ participant });
    expect(response.headers.get('set-cookie')).toContain('invnity_session=rotated-session-token');
  });

  it('maps an expired recovery token to the generic invalid-token response', async () => {
    consumeRecoveryToken.mockRejectedValue(new HttpError(401, 'RECOVERY_TOKEN_INVALID', 'Tautan pemulihan tidak valid atau sudah kedaluwarsa.'));

    const response = await consumeRecovery(new Request('https://moments.example.test/api/v1/access-recovery/consume', {
      method: 'POST',
      body: JSON.stringify({ token: 'an-expired-recovery-token' }),
      headers: { 'content-type': 'application/json' },
    }));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: 'RECOVERY_TOKEN_INVALID' }, request_id: expect.any(String) });
  });

  it('maps expected disabled-participant database errors without leaking input', async () => {
    createDatabaseClient.mockReturnValue({
      rpc: vi.fn().mockRejectedValue(Object.assign(new Error('PARTICIPANT_DISABLED'), { code: 'PARTICIPANT_DISABLED' })),
    });

    const response = await register(new Request('https://moments.example.test/api/v1/events/reuni/participants', {
      method: 'POST',
      body: JSON.stringify({ name: 'Sari', batch: 'IA 5', email: 'private@example.test' }),
      headers: { 'content-type': 'application/json' },
    }), { params: Promise.resolve({ event: 'reuni' }) });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({ error: { code: 'PARTICIPANT_DISABLED' }, request_id: expect.any(String) });
    expect(JSON.stringify(body)).not.toContain('private@example.test');
  });
});
