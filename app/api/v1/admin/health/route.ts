import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../../lib/auth/admin';
import { apiError, requestId } from '../../../../../lib/auth/http';
import { clientRateLimitKey, enforceRateLimit } from '../../../../../lib/auth/rate-limits';
import { getPublicEventConfig } from '../../../../../lib/event-config';
import { getSystemHealth } from '../../../../../lib/health/checks';

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    await enforceRateLimit('admin-health', clientRateLimitKey(request), 30, 60_000);
    await requireAdmin(request);
    const data = await getSystemHealth(getPublicEventConfig().eventId);
    return NextResponse.json({ data, request_id: id }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return apiError(error, id);
  }
}
