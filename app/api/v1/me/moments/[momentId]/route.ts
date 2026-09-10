import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertTrustedMutation } from '../../../../../../lib/auth/csrf';
import { apiError, requestId } from '../../../../../../lib/auth/http';
import { requireParticipant } from '../../../../../../lib/auth/session';
import { clientRateLimitKey, enforceRateLimit } from '../../../../../../lib/auth/rate-limits';
import { deleteOwnedMoment, updateOwnedMoment } from '../../../../../../lib/db/repositories/moments';
import { MOMENT_CATEGORIES } from '../../../../../../lib/db/types';

const momentIdSchema = z.string().uuid();
const patchSchema = z.object({ category: z.enum(MOMENT_CATEGORIES) });

export async function PATCH(request: Request, context: { params: Promise<{ momentId: string }> }) {
  const id = requestId();
  try {
    assertTrustedMutation(request);
    await enforceRateLimit('owned-moment-update', clientRateLimitKey(request), 30, 60_000);
    const participant = await requireParticipant(request);
    const momentId = momentIdSchema.parse((await context.params).momentId);
    const { category } = patchSchema.parse(await request.json());
    const moment = await updateOwnedMoment(participant.id, momentId, category);
    return NextResponse.json({ data: { moment }, request_id: id });
  } catch (error) {
    return apiError(error, id);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ momentId: string }> }) {
  const id = requestId();
  try {
    assertTrustedMutation(request);
    await enforceRateLimit('owned-moment-delete', clientRateLimitKey(request), 20, 60_000);
    const participant = await requireParticipant(request);
    const momentId = momentIdSchema.parse((await context.params).momentId);
    await deleteOwnedMoment(participant.id, momentId);
    return NextResponse.json({ data: { momentId }, request_id: id });
  } catch (error) {
    return apiError(error, id);
  }
}
