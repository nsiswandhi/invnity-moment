import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '../../../../../lib/auth/admin';
import { assertTrustedMutation } from '../../../../../lib/auth/csrf';
import { apiError, requestId } from '../../../../../lib/auth/http';
import { clientRateLimitKey, enforceRateLimit } from '../../../../../lib/auth/rate-limits';
import { setEventMode } from '../../../../../lib/db/repositories/admin';
import { getPublicEventConfig } from '../../../../../lib/event-config';

const schema = z.object({ mode: z.enum(['live', 'maintenance', 'archived']) });

export async function PATCH(request: Request) {
  const id = requestId();
  try {
    assertTrustedMutation(request);
    await enforceRateLimit('admin-event-mode', clientRateLimitKey(request), 20, 60_000);
    await requireAdmin(request);
    const { mode } = schema.parse(await request.json());
    const event = await setEventMode(getPublicEventConfig().eventId, mode);
    return NextResponse.json({ data: { event }, request_id: id });
  } catch (error) {
    return apiError(error, id);
  }
}
