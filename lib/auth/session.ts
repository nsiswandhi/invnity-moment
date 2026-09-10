import { createHash, randomBytes } from 'node:crypto';
import { HttpError } from '../errors/http-error';
import { createDatabaseClient, type DatabaseClient } from '../db/client';

export const SESSION_COOKIE_NAME = 'invnity_session';
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export type AuthenticatedParticipant = { id: string; eventId: string; name: string; batch: string; status: string };
export type SessionCookie = { name: string; value: string; httpOnly: true; secure: true; sameSite: 'lax'; path: '/'; maxAge: number };
export type ParticipantSessionSummary = { participant: Omit<AuthenticatedParticipant, 'status'>; cookie: SessionCookie; expiresAt: string };

type SessionInput = { participant: AuthenticatedParticipant; db?: DatabaseClient; now?: Date };
type SessionLookup = AuthenticatedParticipant & { expiresAt: string; revokedAt: string | null };

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function sessionTokenFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const prefix = `${SESSION_COOKIE_NAME}=`;
  const item = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : null;
}

export function getSessionTokenHash(request: Request): string | null {
  const token = sessionTokenFromRequest(request);
  return token ? hashOpaqueToken(token) : null;
}

export async function createParticipantSession({ participant, db = createDatabaseClient(), now = new Date() }: SessionInput): Promise<ParticipantSessionSummary> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db.rpc<void>('create_access_session', {
    p_participant_id: participant.id,
    p_session_token_hash: hashOpaqueToken(token),
    p_expires_at: expiresAt.toISOString(),
  });
  return {
    participant: { id: participant.id, eventId: participant.eventId, name: participant.name, batch: participant.batch },
    cookie: { name: SESSION_COOKIE_NAME, value: token, httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: SESSION_TTL_MS / 1000 },
    expiresAt: expiresAt.toISOString(),
  };
}

export async function requireParticipant(request: Request, db: DatabaseClient = createDatabaseClient(), now = new Date()): Promise<AuthenticatedParticipant> {
  const tokenHash = getSessionTokenHash(request);
  if (!tokenHash) throw new HttpError(401, 'UNAUTHENTICATED', 'Sesi kamu sudah berakhir. Silakan masuk kembali.');
  const participant = await db.rpc<SessionLookup | null>('get_authenticated_participant_for_session', { p_session_token_hash: tokenHash });
  if (!participant || participant.status !== 'active' || participant.revokedAt || new Date(participant.expiresAt) <= now) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Sesi kamu sudah berakhir. Silakan masuk kembali.');
  }
  return { id: participant.id, eventId: participant.eventId, name: participant.name, batch: participant.batch, status: participant.status };
}
