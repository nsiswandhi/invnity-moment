import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertTrustedMutation } from '../../../../../../lib/auth/csrf';
import { apiError, requestId } from '../../../../../../lib/auth/http';
import { clientRateLimitKey, enforceRateLimit } from '../../../../../../lib/auth/rate-limits';
import { toggleLike } from '../../../../../../lib/db/repositories/public-album';
import { getPublicEventConfig } from '../../../../../../lib/event-config';
import { ANONYMOUS_LIKE_COOKIE, readAnonymousLikeKey } from '../../../../../../lib/likes/anonymous-identity';

function identity(request: Request): { key: string; isNew: boolean } {
  const key = readAnonymousLikeKey(request);
  return key ? { key, isNew: false } : { key: randomBytes(32).toString('base64url'), isNew: true };
}

async function setLike(request: Request, context: { params: Promise<{ momentId: string }> }, liked: boolean) {
  const id = requestId(request);
  try {
    assertTrustedMutation(request);
    await enforceRateLimit('moment-like', clientRateLimitKey(request), 60, 60_000);
    const { momentId: rawMomentId } = await context.params;
    const momentId = z.string().uuid().parse(rawMomentId);
    const { eventId } = getPublicEventConfig();
    const anonymous = identity(request);
    const result = await toggleLike({ eventId, momentId, anonymousUserKey: anonymous.key, liked });
    const response = NextResponse.json({ data: result, request_id: id });
    if (anonymous.isNew) response.cookies.set({ name: ANONYMOUS_LIKE_COOKIE, value: anonymous.key, httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
    return response;
  } catch (error) {
    return apiError(error, id);
  }
}

export function POST(request: Request, context: { params: Promise<{ momentId: string }> }) { return setLike(request, context, true); }
export function DELETE(request: Request, context: { params: Promise<{ momentId: string }> }) { return setLike(request, context, false); }
