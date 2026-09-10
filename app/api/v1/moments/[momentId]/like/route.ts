import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { assertTrustedMutation } from '../../../../../../lib/auth/csrf';
import { apiError, requestId } from '../../../../../../lib/auth/http';
import { clientRateLimitKey, enforceRateLimit } from '../../../../../../lib/auth/rate-limits';
import { toggleLike } from '../../../../../../lib/db/repositories/public-album';

const COOKIE_NAME = 'invnity_like_key';
const COOKIE_PATTERN = /^[A-Za-z0-9_-]{20,128}$/;

function cookieValue(request: Request): string | null {
  const prefix = `${COOKIE_NAME}=`;
  const raw = (request.headers.get('cookie') ?? '').split(';').map((item) => item.trim()).find((item) => item.startsWith(prefix))?.slice(prefix.length);
  if (!raw) return null;
  try {
    const value = decodeURIComponent(raw);
    return COOKIE_PATTERN.test(value) ? value : null;
  } catch {
    return null;
  }
}

function identity(request: Request): { key: string; isNew: boolean } {
  const key = cookieValue(request);
  return key ? { key, isNew: false } : { key: randomBytes(32).toString('base64url'), isNew: true };
}

async function setLike(request: Request, context: { params: Promise<{ momentId: string }> }, liked: boolean) {
  const id = requestId();
  try {
    assertTrustedMutation(request);
    await enforceRateLimit('moment-like', clientRateLimitKey(request), 60, 60_000);
    const { momentId } = await context.params;
    const anonymous = identity(request);
    const result = await toggleLike({ momentId, anonymousUserKey: anonymous.key, liked });
    const response = NextResponse.json({ data: result, request_id: id });
    if (anonymous.isNew) response.cookies.set({ name: COOKIE_NAME, value: anonymous.key, httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
    return response;
  } catch (error) {
    return apiError(error, id);
  }
}

export function POST(request: Request, context: { params: Promise<{ momentId: string }> }) { return setLike(request, context, true); }
export function DELETE(request: Request, context: { params: Promise<{ momentId: string }> }) { return setLike(request, context, false); }
