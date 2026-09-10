import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertTrustedMutation } from '../../../../../../lib/auth/csrf';
import { apiError, requestId } from '../../../../../../lib/auth/http';
import { requireParticipant } from '../../../../../../lib/auth/session';
import { clientRateLimitKey, enforceRateLimit } from '../../../../../../lib/auth/rate-limits';
import { HttpError } from '../../../../../../lib/errors/http-error';
import { authorizePublicDownload } from '../../../../../../lib/db/repositories/public-album';
import { createDownloadAuthorization } from '../../../../../../lib/media/upload-service';

const downloadSchema = z.object({ variant: z.enum(['display', 'original']).default('display') });

export async function POST(request: Request, context: { params: Promise<{ momentId: string }> }) {
  const id = requestId();
  try {
    assertTrustedMutation(request);
    await enforceRateLimit('moment-download', clientRateLimitKey(request), 60, 60_000);
    const { momentId } = await context.params;
    const input = downloadSchema.parse(await request.json().catch(() => ({})));
    let authorization;
    try {
      const participant = await requireParticipant(request);
      authorization = await createDownloadAuthorization({ momentId, participantId: participant.id, variant: input.variant });
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 401) throw error;
      authorization = await authorizePublicDownload({ momentId, variant: input.variant });
    }
    return NextResponse.json({ data: authorization, request_id: id });
  } catch (error) {
    return apiError(error, id);
  }
}
