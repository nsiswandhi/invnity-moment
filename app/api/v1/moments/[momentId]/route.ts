import { NextResponse } from 'next/server';
import { apiError, requestId } from '../../../../../lib/auth/http';
import { clientRateLimitKey, enforceRateLimit } from '../../../../../lib/auth/rate-limits';
import { getPublishedMoment } from '../../../../../lib/db/repositories/public-album';

export async function GET(request: Request, context: { params: Promise<{ momentId: string }> }) {
  const id = requestId();
  try {
    await enforceRateLimit('public-album-detail', clientRateLimitKey(request), 120, 60_000);
    const { momentId } = await context.params;
    const moment = await getPublishedMoment(momentId);
    if (!moment) return NextResponse.json({ error: { code: 'MOMENT_NOT_FOUND', message: 'Momen tidak ditemukan.' }, request_id: id }, { status: 404 });
    return NextResponse.json({ data: { moment }, request_id: id });
  } catch (error) {
    return apiError(error, id);
  }
}
