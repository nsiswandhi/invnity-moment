import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertTrustedMutation, createCsrfCookie } from '../../../../../../lib/auth/csrf';
import { apiError, requestId } from '../../../../../../lib/auth/http';
import { clientRateLimitKey, enforceRateLimit } from '../../../../../../lib/auth/rate-limits';
import { createParticipantSession, getSessionTokenHash, requireParticipant, type AuthenticatedParticipant } from '../../../../../../lib/auth/session';
import { createDatabaseClient } from '../../../../../../lib/db/client';
import { validateParticipantInput } from '../../../../../../lib/validation/participant';

export async function POST(request: Request, context: { params: Promise<{ event: string }> }) {
  const id = requestId();
  try {
    assertTrustedMutation(request);
    await enforceRateLimit('registration', clientRateLimitKey(request), 8, 60_000);
    const input = validateParticipantInput(await request.json());
    const event = z.string().min(1).max(100).parse((await context.params).event);
    const db = createDatabaseClient();
    const sessionTokenHash = getSessionTokenHash(request);
    if (sessionTokenHash) {
      const authenticated = await requireParticipant(request, db);
      const participant = await db.rpc<AuthenticatedParticipant>('resume_participant_for_event', {
        p_event_slug: event,
        p_participant_id: authenticated.id,
        p_session_token_hash: sessionTokenHash,
      });
      const response = NextResponse.json({ data: { participant: { id: participant.id, eventId: participant.eventId, name: participant.name, batch: participant.batch }, resumed: true }, request_id: id });
      response.cookies.set(createCsrfCookie());
      return response;
    }
    const participant = await db.rpc<AuthenticatedParticipant>('register_participant_for_event', {
      p_event_slug: event, p_name: input.name, p_batch: input.batch, p_email: input.email, p_consent_version: '2026-09-09',
    });
    const session = await createParticipantSession({ participant, db });
    const response = NextResponse.json({ data: { participant: session.participant, expires_at: session.expiresAt }, request_id: id }, { status: 201 });
    response.cookies.set(session.cookie);
    response.cookies.set(createCsrfCookie());
    return response;
  } catch (error) {
    return apiError(error, id);
  }
}
