import { NextResponse, type NextRequest } from 'next/server';
import { applySecurityHeaders } from './lib/security/headers';
import { REQUEST_ID_HEADER, resolveRequestId } from './lib/security/request-id';

export function middleware(request: NextRequest) {
  const id = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, id);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  applySecurityHeaders(response.headers, id);
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
