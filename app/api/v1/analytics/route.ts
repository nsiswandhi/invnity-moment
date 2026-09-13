import { NextResponse } from 'next/server';
import { parseAnalyticsEvent } from '../../../../lib/analytics/event-schema';
import { trackServerEvent } from '../../../../lib/analytics/server-events';
import { apiError, requestId } from '../../../../lib/auth/http';
import { clientRateLimitKey, enforceRateLimit } from '../../../../lib/auth/rate-limits';
import { HttpError } from '../../../../lib/errors/http-error';
import { getPublicEventConfig } from '../../../../lib/event-config';
import { safeLog } from '../../../../lib/security/redaction';

const MAX_ANALYTICS_BODY_BYTES = 8_192;

function assertAnalyticsRequestHeaders(request: Request): void {
  if (request.headers.get('content-type')?.trim().toLowerCase() !== 'application/json') {
    throw new HttpError(415, 'ANALYTICS_CONTENT_TYPE_INVALID', 'Data analitik harus dikirim sebagai JSON.');
  }
  const contentLength = request.headers.get('content-length');
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_ANALYTICS_BODY_BYTES)) {
    throw new HttpError(413, 'ANALYTICS_BODY_TOO_LARGE', 'Data analitik terlalu besar.');
  }
}

async function readAnalyticsBody(request: Request): Promise<unknown> {
  assertAnalyticsRequestHeaders(request);
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_ANALYTICS_BODY_BYTES) throw new HttpError(413, 'ANALYTICS_BODY_TOO_LARGE', 'Data analitik terlalu besar.');
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    await enforceRateLimit('analytics-event', clientRateLimitKey(request), 240, 60_000);
    const body = await readAnalyticsBody(request).catch((error) => {
      if (error instanceof HttpError) throw error;
      return null;
    });
    let event;
    try { event = parseAnalyticsEvent(body); } catch { throw new HttpError(400, 'ANALYTICS_EVENT_INVALID', 'Data analitik tidak valid.'); }
    await trackServerEvent({ eventId: getPublicEventConfig().eventId, participantId: null, ...event });
    return NextResponse.json({ data: { accepted: true }, request_id: id }, { status: 202, headers: { 'cache-control': 'no-store', 'x-request-id': id } });
  } catch (error) {
    if (error instanceof HttpError && error.code === 'RATE_LIMITED') safeLog('rate_limit_rejected', { scope: 'analytics-event', requestId: id });
    return apiError(error, id);
  }
}
