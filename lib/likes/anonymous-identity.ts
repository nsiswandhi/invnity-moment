export const ANONYMOUS_LIKE_COOKIE = 'invnity_like_key';
const COOKIE_PATTERN = /^[A-Za-z0-9_-]{20,128}$/;

export function readAnonymousLikeKey(request: Request): string | null {
  const prefix = `${ANONYMOUS_LIKE_COOKIE}=`;
  const raw = (request.headers.get('cookie') ?? '').split(';').map((item) => item.trim()).find((item) => item.startsWith(prefix))?.slice(prefix.length);
  if (!raw) return null;
  try {
    const value = decodeURIComponent(raw);
    return COOKIE_PATTERN.test(value) ? value : null;
  } catch {
    return null;
  }
}
