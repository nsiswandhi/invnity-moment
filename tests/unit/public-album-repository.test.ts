import { describe, expect, it, vi } from 'vitest';
import { createSupabasePublicAlbumDatabase, type PublicMomentRow } from '../../lib/db/repositories/public-album';
import type { DatabaseClient } from '../../lib/db/client';

const eventId = 'bd928dad-a8c6-40af-a482-30df35ad5e5b';
const momentId = '1ef1d9e5-2d09-4c1e-84dd-9e7c6bb0c219';
const participantId = 'e3a7c9f1-30b0-4f8b-9ad4-5adfc8445e5c';
const row: PublicMomentRow = {
  id: momentId,
  category: 'REUNI',
  likeCount: 4,
  createdAt: '2026-09-10T00:00:00.000Z',
  publishedAt: '2026-09-10T00:00:00.000Z',
  r2DisplayKey: `events/${eventId}/participants/${participantId}/moments/${momentId}/display.jpg`,
  r2ThumbnailKey: `events/${eventId}/participants/${participantId}/moments/${momentId}/thumbnail.jpg`,
  r2OriginalKey: `events/${eventId}/participants/${participantId}/moments/${momentId}/original`,
};

describe('public album repository', () => {
  it('lists published moments with the default cursor contract and signs only safe media URLs', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [row], nextCursor: 'opaque-next' });
    const presignGet = vi.fn(async (key: string) => `https://cdn.example.test/${key}`);
    const database = createSupabasePublicAlbumDatabase({ rpc } as DatabaseClient, { presignGet });

    await expect(database.listPublishedMoments({ eventId, category: null, cursor: null, limit: 30 })).resolves.toEqual({
      data: [{ id: momentId, category: 'REUNI', likeCount: 4, createdAt: row.createdAt, publishedAt: row.publishedAt, thumbnailUrl: expect.stringContaining('thumbnail.jpg'), displayUrl: expect.stringContaining('display.jpg') }],
      nextCursor: 'opaque-next',
    });
    expect(rpc).toHaveBeenCalledWith('list_published_moments', { p_event_id: eventId, p_category: null, p_cursor: null, p_limit: 30 });
  });

  it('uses an atomic database operation for active anonymous likes', async () => {
    const rpc = vi.fn().mockResolvedValue({ liked: true, likeCount: 5 });
    const database = createSupabasePublicAlbumDatabase({ rpc } as DatabaseClient, { presignGet: vi.fn() });

    await expect(database.toggleLike({ momentId, anonymousUserKey: 'opaque-browser-key', liked: true })).resolves.toEqual({ liked: true, likeCount: 5 });
    expect(rpc).toHaveBeenCalledWith('set_public_moment_like', expect.objectContaining({ p_moment_id: momentId, p_liked: true, p_anonymous_user_key_hash: expect.stringMatching(/^[a-f0-9]{64}$/) }));
  });
});
