import { REQUEST_ID_HEADER } from './request-id';

export function contentSecurityPolicy(nonce?: string, environment: Pick<NodeJS.ProcessEnv, 'NODE_ENV'> = process.env): string {
  const nonceSource = nonce ? ` 'nonce-${nonce}'` : '';
  const developmentSource = environment.NODE_ENV === 'production' ? '' : " 'unsafe-eval'";
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self'${developmentSource}${nonceSource}`,
    `style-src 'self'${nonceSource}`,
    "img-src 'self' blob: data: https://*.r2.cloudflarestorage.com",
    "media-src 'self' blob:",
    "connect-src 'self' https://*.supabase.co https://*.r2.cloudflarestorage.com",
  ].join('; ');
}

export function applySecurityHeaders(headers: Headers, id: string, environment = process.env, nonce?: string): void {
  headers.set('content-security-policy', contentSecurityPolicy(nonce, environment));
  headers.set('cross-origin-opener-policy', 'same-origin');
  headers.set('cross-origin-resource-policy', 'same-origin');
  headers.set('permissions-policy', 'camera=(self), microphone=(), geolocation=()');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'DENY');
  headers.set(REQUEST_ID_HEADER, id);
  if (environment.NODE_ENV === 'production') headers.set('strict-transport-security', 'max-age=63072000; includeSubDomains; preload');
}
