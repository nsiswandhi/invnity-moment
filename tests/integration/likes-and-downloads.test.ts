import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from '../../lib/errors/http-error';

const { assertTrustedMutation, clientRateLimitKey, enforceRateLimit, getPublicEventState, getPublishedMoment, listPublishedMoments, toggleLike } = vi.hoisted(() => ({
  assertTrustedMutation: vi.fn(),
  clientRateLimitKey: vi.fn().mockReturnValue('anonymous-client'),
  enforceRateLimit: vi.fn(),
  getPublicEventState: vi.fn(),
  getPublishedMoment: vi.fn(),
  listPublishedMoments: vi.fn(),
  toggleLike: vi.fn(),
}));

vi.mock('../../lib/auth/csrf', () => ({ assertTrustedMutation }));
vi.mock('../../lib/auth/rate-limits', () => ({ clientRateLimitKey, enforceRateLimit }));
vi.mock('../../lib/db/repositories/public-album', () => ({ getPublicEventState, getPublishedMoment, listPublishedMoments, toggleLike }));

import { GET as list } from '../../app/api/v1/moments/route';
import { GET as detail } from '../../app/api/v1/moments/[momentId]/route';
import { DELETE as unlike, POST as like } from '../../app/api/v1/moments/[momentId]/like/route';

const eventId = 'bd928dad-a8c6-40af-a482-30df35ad5e5b';
const momentId = '1ef1d9e5-2d09-4c1e-84dd-9e7c6bb0c219';
const moment = { id: momentId, category: 'REUNI', likeCount: 2, createdAt: '2026-09-10T00:00:00.000Z', publishedAt: '2026-09-10T00:00:00.000Z', thumbnailUrl: 'https://cdn.test/thumb', displayUrl: 'https://cdn.test/display' };

describe('public album routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_EVENT_ID', eventId);
    vi.stubEnv('NEXT_PUBLIC_EVENT_SLUG', 'reuni-akbar-ia5-2026');
    enforceRateLimit.mockResolvedValue(undefined);
    getPublicEventState.mockResolvedValue({ eventId, name: 'Reuni Akbar IA 5 Bandung', eventDate: '2026-10-10', status: 'live' });
    listPublishedMoments.mockResolvedValue({ data: [{ ...moment, liked: true }], nextCursor: 'next' });
    getPublishedMoment.mockResolvedValue(moment);
    toggleLike.mockResolvedValue({ liked: true, likeCount: 3 });
  });

  it('uses the public event, default limit, cursor, and category filter', async () => {
    const response = await list(new Request(`https://moments.example.test/api/v1/moments?category=REUNI&cursor=cursor-1&limit=30`));
    expect(response.status).toBe(200);
    expect(listPublishedMoments).toHaveBeenCalledWith({ eventId, category: 'REUNI', cursor: 'cursor-1', limit: 30, anonymousUserKey: null });
    expect(await response.json()).toMatchObject({ data: { data: [{ ...moment, liked: true }], nextCursor: 'next' }, event: { status: 'live' }, request_id: expect.any(String) });
  });

  it('rejects invalid categories before touching the repository', async () => {
    const response = await list(new Request('https://moments.example.test/api/v1/moments?category=private'));
    expect(response.status).toBe(400);
    expect(listPublishedMoments).not.toHaveBeenCalled();
  });

  it('returns only the published public detail projection', async () => {
    const response = await detail(new Request(`https://moments.example.test/api/v1/moments/${momentId}`), { params: Promise.resolve({ momentId }) });
    expect(response.status).toBe(200);
    expect(getPublishedMoment).toHaveBeenCalledWith({ eventId, momentId, anonymousUserKey: null });
    expect(await response.json()).toMatchObject({ data: { moment }, request_id: expect.any(String) });
  });

  it('creates a stable anonymous identity cookie and rate-limits likes', async () => {
    const response = await like(new Request(`https://moments.example.test/api/v1/moments/${momentId}/like`, { method: 'POST', headers: { origin: 'https://moments.example.test' } }), { params: Promise.resolve({ momentId }) });
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('invnity_like_key=');
    expect(toggleLike).toHaveBeenCalledWith({ eventId, momentId, anonymousUserKey: expect.stringMatching(/^[A-Za-z0-9_-]{40,}$/), liked: true });
    expect(enforceRateLimit).toHaveBeenCalledWith('moment-like', 'anonymous-client', 60, 60_000);
  });

  it('returns a limiter refusal without changing like state', async () => {
    enforceRateLimit.mockRejectedValueOnce(new HttpError(429, 'RATE_LIMITED', 'Terlalu banyak permintaan. Coba lagi sebentar.'));
    const response = await like(new Request(`https://moments.example.test/api/v1/moments/${momentId}/like`, { method: 'POST' }), { params: Promise.resolve({ momentId }) });
    expect(response.status).toBe(429);
    expect(toggleLike).not.toHaveBeenCalled();
  });

  it('removes the current anonymous like through the same unique identity', async () => {
    const response = await unlike(new Request(`https://moments.example.test/api/v1/moments/${momentId}/like`, { method: 'DELETE', headers: { cookie: 'invnity_like_key=browser-key-12345678901234567890' } }), { params: Promise.resolve({ momentId }) });
    expect(response.status).toBe(200);
    expect(toggleLike).toHaveBeenCalledWith({ eventId, momentId, anonymousUserKey: 'browser-key-12345678901234567890', liked: false });
  });

  it('rejects non-UUID public IDs before querying another event', async () => {
    const response = await detail(new Request('https://moments.example.test/api/v1/moments/not-a-uuid'), { params: Promise.resolve({ momentId: 'not-a-uuid' }) });
    expect(response.status).toBe(400);
    expect(getPublishedMoment).not.toHaveBeenCalled();
  });
});
