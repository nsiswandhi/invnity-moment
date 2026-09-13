import { NextResponse, type NextRequest } from 'next/server';
import { applySecurityHeaders, contentSecurityPolicy } from './lib/security/headers';
import { REQUEST_ID_HEADER, resolveRequestId } from './lib/security/request-id';

export function middleware(request: NextRequest) {
  const id = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
  const policy = contentSecurityPolicy(undefined, process.env);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, id);
  requestHeaders.set('content-security-policy', policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  applySecurityHeaders(response.headers, id, process.env);
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
