import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertTrustedMutation } from '../../../../../lib/auth/csrf';
import { apiError, requestId } from '../../../../../lib/auth/http';
import { requireParticipant } from '../../../../../lib/auth/session';
import { clientRateLimitKey, enforceRateLimit } from '../../../../../lib/auth/rate-limits';
import { HttpError } from '../../../../../lib/errors/http-error';
import { createUploadAuthorization } from '../../../../../lib/media/upload-service';

const reserveSchema = z.object({
  eventId: z.string().uuid(),
  contentType: z.string().trim().min(1).max(100),
  reservationId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const id = requestId();
  try {
    assertTrustedMutation(request);
    await enforceRateLimit('moment-reserve', clientRateLimitKey(request), 10, 60_000);
    const participant = await requireParticipant(request);
    const input = reserveSchema.parse(await request.json());
    if (input.eventId !== participant.eventId) throw new HttpError(403, 'EVENT_FORBIDDEN', 'Acara ini tidak tersedia untuk sesi kamu.');
    const authorization = await createUploadAuthorization({ ...input, participantId: participant.id });
    return NextResponse.json({ data: authorization, request_id: id }, { status: 201 });
  } catch (error) {
    return apiError(error, id);
  }
}
