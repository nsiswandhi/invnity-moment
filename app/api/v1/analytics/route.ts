import { NextResponse } from 'next/server';
import { parseAnalyticsEvent } from '../../../../lib/analytics/event-schema';
import { trackServerEvent } from '../../../../lib/analytics/server-events';
import { apiError, requestId } from '../../../../lib/auth/http';
import { clientRateLimitKey, enforceRateLimit } from '../../../../lib/auth/rate-limits';
import { HttpError } from '../../../../lib/errors/http-error';
import { getPublicEventConfig } from '../../../../lib/event-config';
import { safeLog } from '../../../../lib/security/redaction';

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    await enforceRateLimit('analytics-event', clientRateLimitKey(request), 240, 60_000);
    const body = await request.json().catch(() => null);
    let event;
    try { event = parseAnalyticsEvent(body); } catch { throw new HttpError(400, 'ANALYTICS_EVENT_INVALID', 'Data analitik tidak valid.'); }
    await trackServerEvent({ eventId: getPublicEventConfig().eventId, participantId: null, ...event });
    return NextResponse.json({ data: { accepted: true }, request_id: id }, { status: 202, headers: { 'cache-control': 'no-store', 'x-request-id': id } });
  } catch (error) {
    if (error instanceof HttpError && error.code === 'RATE_LIMITED') safeLog('rate_limit_rejected', { scope: 'analytics-event', requestId: id });
    return apiError(error, id);
  }
}
