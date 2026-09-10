import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertTrustedMutation } from '../../../../lib/auth/csrf';
import { apiError, requestId } from '../../../../lib/auth/http';
import { clientRateLimitKey, enforceRateLimit } from '../../../../lib/auth/rate-limits';
import { queueRecoveryRequest } from '../../../../lib/recovery/recovery-request';

const requestSchema = z.object({ event: z.string().uuid(), email: z.string().email().max(254) });
const accepted = { data: { message: 'Jika email terdaftar, tautan pemulihan akan dikirim.' } };

export async function POST(request: Request) {
  const id = requestId();
  try {
    assertTrustedMutation(request);
    await enforceRateLimit('recovery', clientRateLimitKey(request), 5, 60_000);
    const input = requestSchema.parse(await request.json());
    await queueRecoveryRequest({ email: input.email, eventId: input.event });
    return NextResponse.json({ ...accepted, request_id: id }, { status: 202 });
  } catch (error) {
    return apiError(error, id);
  }
}
