import { NextResponse } from 'next/server';
import { assertTrustedMutation } from '../../../../../lib/auth/csrf';
import { apiError, requestId } from '../../../../../lib/auth/http';
import { getSessionTokenHash, requireParticipant, SESSION_COOKIE_NAME } from '../../../../../lib/auth/session';
import { createDatabaseClient } from '../../../../../lib/db/client';

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    assertTrustedMutation(request);
    await requireParticipant(request);
    const tokenHash = getSessionTokenHash(request);
    await createDatabaseClient().rpc<void>('revoke_access_session', { p_session_token_hash: tokenHash });
    const response = NextResponse.json({ data: { revoked: true }, request_id: id });
    response.cookies.set({ name: SESSION_COOKIE_NAME, value: '', httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
    return response;
  } catch (error) {
    return apiError(error, id);
  }
}
