import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { HttpError } from '../../lib/errors/http-error';
import type { DatabaseClient } from '../../lib/db/client';
import { validateParticipantInput } from '../../lib/validation/participant';
import { createParticipantSession, requireParticipant, SESSION_COOKIE_NAME } from '../../lib/auth/session';
import { consumeRecoveryToken } from '../../lib/auth/recovery';

const participant = {
  id: 'a71691a1-b376-4695-a7a3-66ed840125c2',
  eventId: 'bd928dad-a8c6-40af-a482-30df35ad5e5b',
  name: 'Sari Wijaya',
  batch: 'IA 5',
  status: 'active',
};

function fakeDatabaseClient(response: unknown): DatabaseClient {
  return { rpc: async <T>() => response as T };
}

describe('participant validation', () => {
  it('normalizes whitespace and email casing before registration', () => {
    expect(validateParticipantInput({ name: '  Sari   Wijaya ', batch: ' IA 5 ', email: ' SARI@Example.TEST ' }))
      .toEqual({ name: 'Sari Wijaya', batch: 'IA 5', email: 'sari@example.test' });
  });

  it('rejects a registration with a missing batch', () => {
    expect(() => validateParticipantInput({ name: 'Sari', batch: ' ', email: 'sari@example.test' }))
      .toThrow(/batch/i);
  });
});

describe('participant sessions', () => {
  it('stores only a hash and returns a secure HttpOnly same-site cookie', async () => {
    let receivedHash = '';
    const session = await createParticipantSession({
      participant,
      db: {
        rpc: async <T>(name: string, parameters: Record<string, unknown>) => {
          expect(name).toBe('create_access_session');
          receivedHash = String(parameters.p_session_token_hash);
          return undefined as T;
        },
      },
      now: new Date('2026-09-10T00:00:00.000Z'),
    });

    expect(session.cookie).toMatchObject({ name: SESSION_COOKIE_NAME, httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
    expect(session.cookie.value).not.toBe(receivedHash);
    expect(receivedHash).toBe(createHash('sha256').update(session.cookie.value).digest('hex'));
    expect(session.participant).toEqual({ id: participant.id, eventId: participant.eventId, name: 'Sari Wijaya', batch: 'IA 5' });
  });

  it('rejects expired or revoked sessions', async () => {
    const request = new Request('https://moments.example.test/api/v1/me', { headers: { cookie: `${SESSION_COOKIE_NAME}=token` } });
    const db = fakeDatabaseClient({ ...participant, expiresAt: '2026-09-09T23:59:59.000Z', revokedAt: null });

    await expect(requireParticipant(request, db, new Date('2026-09-10T00:00:00.000Z')))
      .rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' } satisfies Partial<HttpError>);
  });
});

describe('recovery tokens', () => {
  it('consumes a valid token only once', async () => {
    let calls = 0;
    const db: DatabaseClient = { rpc: async <T>() => (++calls === 1 ? participant : null) as T };

    await expect(consumeRecoveryToken('one-use-token', db, new Date('2026-09-10T00:00:00.000Z'))).resolves.toEqual(participant);
    await expect(consumeRecoveryToken('one-use-token', db, new Date('2026-09-10T00:00:00.000Z')))
      .rejects.toMatchObject({ status: 401, code: 'RECOVERY_TOKEN_INVALID' } satisfies Partial<HttpError>);
  });
});
