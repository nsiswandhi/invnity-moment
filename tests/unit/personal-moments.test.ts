import { describe, expect, it, vi } from 'vitest';
import { deleteOwnedMomentRequest, loadOwnedMoments, mergeOwnedMoments, updateOwnedMomentRequest } from '../../lib/moments/personal-moments';
import type { MomentRecord } from '../../lib/db/types';

const moment = (id: string, category: MomentRecord['category'] = 'REUNI'): MomentRecord => ({ id, participantId: 'participant-1', eventId: 'event-1', status: 'PUBLISHED', category, r2OriginalKey: 'original', r2DisplayKey: 'display', r2ThumbnailKey: 'thumbnail', mimeType: 'image/jpeg', byteSize: 100, width: 10, height: 10, createdAt: '2026-09-10T00:00:00.000Z', publishedAt: '2026-09-10T00:00:00.000Z', deletedAt: null });

describe('personal moments client', () => {
  it('loads a requested cursor and retains local items not yet returned by the server', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { data: [moment('server')], nextCursor: 'later' } }), { status: 200 }));
    await expect(loadOwnedMoments(fetcher, 'cursor-1', 2)).resolves.toEqual({ data: [moment('server')], nextCursor: 'later' });
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/api/v1/me/moments?'), { credentials: 'same-origin' });
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('cursor=cursor-1');
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('limit=2');
    expect(mergeOwnedMoments({ data: [moment('server')], nextCursor: 'later' }, [moment('local'), moment('server', 'FESTIVAL')])).toEqual({ data: [moment('server'), moment('local')], nextCursor: 'later' });
  });

  it('rejects a failed category change without returning an optimistic replacement', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Tidak dapat disimpan.' } }), { status: 503 }));
    await expect(updateOwnedMomentRequest(fetcher, 'moment-1', 'FESTIVAL', 'csrf')).rejects.toThrow('Tidak dapat disimpan.');
  });

  it('rejects a failed delete without reporting success', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Tidak dapat dihapus.' } }), { status: 409 }));
    await expect(deleteOwnedMomentRequest(fetcher, 'moment-1', 'csrf')).rejects.toThrow('Tidak dapat dihapus.');
  });

  it('sends credentials and CSRF headers for owned mutations', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { moment: moment('updated') } }), { status: 200 }));
    await updateOwnedMomentRequest(fetcher, 'moment-1', 'FESTIVAL', 'csrf');
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ credentials: 'same-origin', method: 'PATCH' });
    expect((fetcher.mock.calls[0]?.[1] as RequestInit).headers).toMatchObject({ 'x-csrf-token': 'csrf' });
  });
});
