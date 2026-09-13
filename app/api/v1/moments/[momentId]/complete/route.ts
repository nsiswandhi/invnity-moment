import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertTrustedMutation } from '../../../../../../lib/auth/csrf';
import { apiError, requestId } from '../../../../../../lib/auth/http';
import { requireParticipant } from '../../../../../../lib/auth/session';
import { clientRateLimitKey, enforceRateLimit } from '../../../../../../lib/auth/rate-limits';
import { MOMENT_CATEGORIES } from '../../../../../../lib/db/types';
import { completeUpload } from '../../../../../../lib/media/upload-service';

const completeSchema = z.object({ category: z.enum(MOMENT_CATEGORIES) });

export async function POST(request: Request, context: { params: Promise<{ momentId: string }> }) {
  const id = requestId(request);
  try {
    assertTrustedMutation(request);
    await enforceRateLimit('moment-complete', clientRateLimitKey(request), 20, 60_000);
    const participant = await requireParticipant(request);
    const { momentId } = await context.params;
    const input = completeSchema.parse(await request.json());
    const moment = await completeUpload({ momentId, participantId: participant.id, category: input.category });
    return NextResponse.json({ data: { moment }, request_id: id });
  } catch (error) {
    return apiError(error, id);
  }
}
