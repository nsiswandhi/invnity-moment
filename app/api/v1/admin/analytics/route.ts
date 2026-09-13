import { NextResponse } from 'next/server';
import { getFunnelSummary, getSponsorSummary } from '../../../../../lib/analytics/aggregates';
import { requireAdmin } from '../../../../../lib/auth/admin';
import { apiError, requestId } from '../../../../../lib/auth/http';
import { clientRateLimitKey, enforceRateLimit } from '../../../../../lib/auth/rate-limits';
import { getPublicEventConfig } from '../../../../../lib/event-config';
import { safeLog } from '../../../../../lib/security/redaction';
import { HttpError } from '../../../../../lib/errors/http-error';

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    await enforceRateLimit('admin-analytics', clientRateLimitKey(request), 60, 60_000);
    await requireAdmin(request);
    const eventId = getPublicEventConfig().eventId;
    const [funnel, sponsor] = await Promise.all([getFunnelSummary(eventId), getSponsorSummary(eventId)]);
    return NextResponse.json({ data: { funnel, sponsor }, request_id: id }, { headers: { 'cache-control': 'no-store', 'x-request-id': id } });
  } catch (error) {
    if (error instanceof HttpError && error.code === 'RATE_LIMITED') safeLog('rate_limit_rejected', { scope: 'admin-analytics', requestId: id });
    return apiError(error, id);
  }
}
