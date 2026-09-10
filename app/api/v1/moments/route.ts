import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, requestId } from '../../../../lib/auth/http';
import { clientRateLimitKey, enforceRateLimit } from '../../../../lib/auth/rate-limits';
import { getPublicEventConfig } from '../../../../lib/event-config';
import { listPublishedMoments } from '../../../../lib/db/repositories/public-album';
import { MOMENT_CATEGORIES } from '../../../../lib/db/types';

const querySchema = z.object({
  category: z.enum(MOMENT_CATEGORIES).nullable(),
  cursor: z.string().trim().min(1).max(200).nullable(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

export async function GET(request: Request) {
  const id = requestId();
  try {
    await enforceRateLimit('public-album-list', clientRateLimitKey(request), 120, 60_000);
    const url = new URL(request.url);
    const query = querySchema.parse({ category: url.searchParams.get('category'), cursor: url.searchParams.get('cursor'), limit: url.searchParams.get('limit') ?? undefined });
    const { eventId } = getPublicEventConfig();
    const page = await listPublishedMoments({ eventId, ...query });
    return NextResponse.json({ data: page, request_id: id });
  } catch (error) {
    return apiError(error, id);
  }
}
