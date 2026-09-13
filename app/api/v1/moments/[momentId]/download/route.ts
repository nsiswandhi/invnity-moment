import { NextResponse } from 'next/server';
import { trackServerEvent } from '../../../../../../lib/analytics/server-events';
import { z } from 'zod';
import { assertTrustedMutation } from '../../../../../../lib/auth/csrf';
import { apiError, requestId } from '../../../../../../lib/auth/http';
import { requireParticipant } from '../../../../../../lib/auth/session';
import { clientRateLimitKey, enforceRateLimit } from '../../../../../../lib/auth/rate-limits';
import { HttpError } from '../../../../../../lib/errors/http-error';
import { authorizePublicDownload } from '../../../../../../lib/db/repositories/public-album';
import { getPublicEventConfig } from '../../../../../../lib/event-config';
import { createDownloadAuthorization } from '../../../../../../lib/media/upload-service';

const downloadSchema = z.object({ variant: z.enum(['display', 'original']).default('display') });

export async function POST(request: Request, context: { params: Promise<{ momentId: string }> }) {
  const id = requestId(request);
  try {
    assertTrustedMutation(request);
    await enforceRateLimit('moment-download', clientRateLimitKey(request), 60, 60_000);
    const { momentId: rawMomentId } = await context.params;
    const momentId = z.string().uuid().parse(rawMomentId);
    const input = downloadSchema.parse(await request.json().catch(() => ({})));
    let authorization;
    let participant;
    try {
      participant = await requireParticipant(request);
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 401) throw error;
    }
    let publicEventId: string | undefined;
    try { publicEventId = getPublicEventConfig().eventId; } catch { publicEventId = undefined; }
    if (publicEventId) {
      try { authorization = await authorizePublicDownload({ eventId: publicEventId, momentId, variant: input.variant }); } catch (error) {
        if (!participant || !(error instanceof HttpError) || error.status !== 404) throw error;
      }
    }
    if (!authorization && participant) authorization = await createDownloadAuthorization({ momentId, participantId: participant.id, variant: input.variant });
    if (!authorization) throw new HttpError(404, 'MOMENT_NOT_AVAILABLE', 'Momen tidak tersedia.');
    const analyticsEventId = publicEventId ?? participant?.eventId;
    if (analyticsEventId) void trackServerEvent({ eventId: analyticsEventId, participantId: null, name: 'moment_downloaded', properties: {} }).catch(() => undefined);
    return NextResponse.json({ data: authorization, request_id: id });
  } catch (error) {
    return apiError(error, id);
  }
}
