import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../../lib/auth/admin';
import { apiError, requestId } from '../../../../../lib/auth/http';
import { clientRateLimitKey, enforceRateLimit } from '../../../../../lib/auth/rate-limits';
import { getAdminSummary } from '../../../../../lib/db/repositories/admin';
import { getPublicEventConfig } from '../../../../../lib/event-config';
import { HttpError } from '../../../../../lib/errors/http-error';

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    await enforceRateLimit('admin-summary', clientRateLimitKey(request), 120, 60_000);
    await requireAdmin(request);
    const summary = await getAdminSummary(getPublicEventConfig().eventId);
    if (!summary) throw new HttpError(404, 'EVENT_NOT_FOUND', 'Acara tidak tersedia.');
    return NextResponse.json({ data: summary, request_id: id }, { headers: { 'cache-control': 'no-store', 'x-request-id': id } });
  } catch (error) {
    return apiError(error, id);
  }
}
