import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertAdminAccessToken, createAdminSessionCookie } from '../../../../../lib/auth/admin';
import { assertTrustedMutation, createCsrfCookie } from '../../../../../lib/auth/csrf';
import { apiError, requestId } from '../../../../../lib/auth/http';
import { clientRateLimitKey, enforceRateLimit } from '../../../../../lib/auth/rate-limits';
import { getAdminByEmail } from '../../../../../lib/db/repositories/admin';
import { HttpError } from '../../../../../lib/errors/http-error';

const schema = z.object({ email: z.string().trim().email().max(254), accessToken: z.string().min(1).max(512) });

export async function POST(request: Request) {
  const id = requestId();
  try {
    assertTrustedMutation(request);
    await enforceRateLimit('admin-auth', clientRateLimitKey(request), 8, 60_000);
    const input = schema.parse(await request.json());
    assertAdminAccessToken(input.accessToken);
    const admin = await getAdminByEmail(input.email);
    if (!admin) throw new HttpError(401, 'ADMIN_UNAUTHENTICATED', 'Akses operator tidak tersedia.');
    const response = NextResponse.json({ data: { admin: { email: admin.email } }, request_id: id });
    response.cookies.set(createAdminSessionCookie(admin));
    response.cookies.set(createCsrfCookie());
    return response;
  } catch (error) {
    return apiError(error, id);
  }
}
