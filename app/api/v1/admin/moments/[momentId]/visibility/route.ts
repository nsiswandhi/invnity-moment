import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '../../../../../../../lib/auth/admin';
import { assertTrustedMutation } from '../../../../../../../lib/auth/csrf';
import { apiError, requestId } from '../../../../../../../lib/auth/http';
import { clientRateLimitKey, enforceRateLimit } from '../../../../../../../lib/auth/rate-limits';
import { hideMoment, unhideMoment } from '../../../../../../../lib/db/repositories/admin';
import { getPublicEventConfig } from '../../../../../../../lib/event-config';

const momentIdSchema = z.string().uuid();
const visibilitySchema = z.discriminatedUnion('visibility', [z.object({ visibility: z.literal('hidden'), reason: z.string().trim().min(1).max(500) }), z.object({ visibility: z.literal('published') })]);

export async function PATCH(request: Request, context: { params: Promise<{ momentId: string }> }) {
  const id = requestId(request);
  try {
    assertTrustedMutation(request);
    await enforceRateLimit('admin-moderation', clientRateLimitKey(request), 60, 60_000);
    const admin = await requireAdmin(request);
    const momentId = momentIdSchema.parse((await context.params).momentId);
    const input = visibilitySchema.parse(await request.json());
    const eventId = getPublicEventConfig().eventId;
    if (input.visibility === 'hidden') await hideMoment(eventId, admin.id, momentId, input.reason);
    else await unhideMoment(eventId, admin.id, momentId);
    return NextResponse.json({ data: { momentId, visibility: input.visibility }, request_id: id });
  } catch (error) {
    return apiError(error, id);
  }
}
