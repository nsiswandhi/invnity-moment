import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertTrustedMutation, createCsrfCookie } from '../../../../../lib/auth/csrf';
import { apiError, requestId } from '../../../../../lib/auth/http';
import { consumeRecoveryToken } from '../../../../../lib/auth/recovery';
import { createParticipantSession } from '../../../../../lib/auth/session';
import { trackServerEvent } from '../../../../../lib/analytics/server-events';

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    assertTrustedMutation(request);
    const { token } = z.object({ token: z.string().min(16).max(512) }).parse(await request.json());
    const participant = await consumeRecoveryToken(token);
    const session = await createParticipantSession({ participant });
    void trackServerEvent({ eventId: participant.eventId, participantId: null, name: 'recovery_completed', properties: {} }).catch(() => undefined);
    const response = NextResponse.json({ data: { participant: session.participant, expires_at: session.expiresAt }, request_id: id });
    response.cookies.set(session.cookie);
    response.cookies.set(createCsrfCookie());
    return response;
  } catch (error) {
    return apiError(error, id);
  }
}
