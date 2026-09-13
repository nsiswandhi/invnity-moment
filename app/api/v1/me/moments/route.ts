import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, requestId } from '../../../../../lib/auth/http';
import { requireParticipant } from '../../../../../lib/auth/session';
import { clientRateLimitKey, enforceRateLimit } from '../../../../../lib/auth/rate-limits';
import { listOwnedMoments } from '../../../../../lib/db/repositories/moments';
import { serializeOwnedMoments } from '../../../../../lib/moments/owned-moment-serializer';

const querySchema = z.object({ cursor: z.string().trim().min(1).max(200).nullable(), limit: z.coerce.number().int().min(1).max(50).default(20) });

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    await enforceRateLimit('owned-moment-list', clientRateLimitKey(request), 60, 60_000);
    const participant = await requireParticipant(request);
    const url = new URL(request.url);
    const query = querySchema.parse({ cursor: url.searchParams.get('cursor'), limit: url.searchParams.get('limit') ?? undefined });
    const page = await listOwnedMoments(participant.id, query.cursor, query.limit);
    return NextResponse.json({ data: await serializeOwnedMoments(page), request_id: id });
  } catch (error) {
    return apiError(error, id);
  }
}
