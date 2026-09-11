import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpError } from '../errors/http-error';
import { createDatabaseClient, type DatabaseClient } from '../db/client';

export const ADMIN_SESSION_COOKIE_NAME = 'invnity_admin_session';
const ADMIN_SESSION_TTL_MS = 1000 * 60 * 60 * 12;

export type AdminUser = { id: string; email: string };
type AdminSessionPayload = AdminUser & { expiresAt: string };

function readCookie(request: Request, name: string): string | null {
  const prefix = `${name}=`;
  const entry = (request.headers.get('cookie') ?? '').split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : null;
}

function sessionSecret(environment = process.env): string {
  const secret = environment.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new HttpError(503, 'ADMIN_AUTH_UNAVAILABLE', 'Akses operator belum dapat digunakan.');
  return secret;
}

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function sameValue(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function parseSession(value: string, secret: string, now: Date): AdminSessionPayload | null {
  const separator = value.lastIndexOf('.');
  if (separator < 1) return null;
  const body = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  if (!sameValue(signature, sign(body, secret))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<AdminSessionPayload>;
    if (!payload || typeof payload.id !== 'string' || typeof payload.email !== 'string' || typeof payload.expiresAt !== 'string' || new Date(payload.expiresAt) <= now) return null;
    return payload as AdminSessionPayload;
  } catch {
    return null;
  }
}

export function createAdminSessionCookie(admin: AdminUser, now = new Date(), environment = process.env) {
  const expiresAt = new Date(now.getTime() + ADMIN_SESSION_TTL_MS).toISOString();
  const body = Buffer.from(JSON.stringify({ ...admin, expiresAt }), 'utf8').toString('base64url');
  return {
    name: ADMIN_SESSION_COOKIE_NAME,
    value: `${body}.${sign(body, sessionSecret(environment))}`,
    httpOnly: true as const,
    secure: true as const,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: ADMIN_SESSION_TTL_MS / 1000,
  };
}

export function assertAdminAccessToken(candidate: unknown, environment = process.env): void {
  const configured = environment.ADMIN_ACCESS_TOKEN;
  if (!configured || configured.length < 32 || typeof candidate !== 'string' || !sameValue(candidate, configured)) {
    throw new HttpError(401, 'ADMIN_UNAUTHENTICATED', 'Akses operator tidak tersedia.');
  }
}

export async function requireAdmin(request: Request, db?: DatabaseClient, now = new Date(), environment = process.env): Promise<AdminUser> {
  const value = readCookie(request, ADMIN_SESSION_COOKIE_NAME);
  if (!value) throw new HttpError(401, 'ADMIN_UNAUTHENTICATED', 'Akses operator tidak tersedia.');
  const payload = parseSession(value, sessionSecret(environment), now);
  if (!payload) throw new HttpError(401, 'ADMIN_UNAUTHENTICATED', 'Akses operator tidak tersedia.');
  const admin = await (db ?? createDatabaseClient()).rpc<AdminUser | null>('get_active_admin_user', { p_admin_user_id: payload.id });
  if (!admin || admin.email !== payload.email) throw new HttpError(401, 'ADMIN_UNAUTHENTICATED', 'Akses operator tidak tersedia.');
  return admin;
}

export function createAdminAccessToken(): string { return randomBytes(32).toString('base64url'); }
