import { randomBytes, timingSafeEqual } from 'node:crypto';
import { getPublicConfig } from '../config';
import { HttpError } from '../errors/http-error';
import { SESSION_COOKIE_NAME } from './session';
import { ADMIN_SESSION_COOKIE_NAME } from './admin';

export const CSRF_COOKIE_NAME = 'invnity_csrf';

function cookieValue(request: Request, name: string): string | null {
  const prefix = `${name}=`;
  const entry = (request.headers.get('cookie') ?? '').split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : null;
}

export function createCsrfCookie() {
  const value = randomBytes(24).toString('base64url');
  return { name: CSRF_COOKIE_NAME, value, httpOnly: false, secure: true, sameSite: 'lax' as const, path: '/', maxAge: 60 * 60 * 24 * 30 };
}

export function assertTrustedMutation(request: Request): void {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(getPublicConfig().appUrl).origin) {
    throw new HttpError(403, 'CSRF_REJECTED', 'Permintaan tidak dapat diproses.');
  }
  const cookies = request.headers.get('cookie') ?? '';
  if (!cookies.includes(`${SESSION_COOKIE_NAME}=`) && !cookies.includes(`${ADMIN_SESSION_COOKIE_NAME}=`)) return;
  const cookie = cookieValue(request, CSRF_COOKIE_NAME);
  const header = request.headers.get('x-csrf-token');
  if (!cookie || !header || cookie.length !== header.length || !timingSafeEqual(Buffer.from(cookie), Buffer.from(header))) {
    throw new HttpError(403, 'CSRF_REJECTED', 'Permintaan tidak dapat diproses.');
  }
}
