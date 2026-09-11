import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '../../../../../lib/auth/admin';
import { apiError, requestId } from '../../../../../lib/auth/http';
import { clientRateLimitKey, enforceRateLimit } from '../../../../../lib/auth/rate-limits';
import { listAdminMoments } from '../../../../../lib/db/repositories/admin';
import { getPublicEventConfig } from '../../../../../lib/event-config';

const querySchema = z.object({ visibility: z.enum(['recent', 'hidden']).default('recent'), limit: z.coerce.number().int().min(1).max(100).default(30) });

export async function GET(request: Request) {
  const id = requestId();
  try {
    await enforceRateLimit('admin-moments', clientRateLimitKey(request), 120, 60_000);
    await requireAdmin(request);
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const data = await listAdminMoments({ eventId: getPublicEventConfig().eventId, ...query });
    return NextResponse.json({ data, request_id: id }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return apiError(error, id);
  }
}
