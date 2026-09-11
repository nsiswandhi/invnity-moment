import { describe, expect, it, vi } from 'vitest';
import { createAdminRepository } from '../../lib/db/repositories/admin';
import { createR2Client } from '../../lib/media/r2-client';

const eventId = 'bd928dad-a8c6-40af-a482-30df35ad5e5b';
const participantId = 'e3a7c9f1-30b0-4f8b-9ad4-5adfc8445e5c';
const momentId = '1ef1d9e5-2d09-4c1e-84dd-9e7c6bb0c219';
const prefix = `events/${eventId}/participants/${participantId}/moments/${momentId}`;
const row = { id: momentId, participantId, category: 'REUNI', status: 'HIDDEN', createdAt: '2026-09-11T00:00:00Z', publishedAt: '2026-09-11T00:00:00Z', hiddenAt: '2026-09-11T00:01:00Z', hiddenReason: 'Privasi', participantName: 'Andi', participantBatch: '1996', r2OriginalKey: `${prefix}/original`, r2DisplayKey: `${prefix}/display.jpg`, r2ThumbnailKey: `${prefix}/thumbnail.jpg` };
const signer = createR2Client({ NODE_ENV: 'test', R2_ACCOUNT_ID: 'test-account', R2_ACCESS_KEY_ID: 'test-key', R2_SECRET_ACCESS_KEY: 'test-secret', R2_BUCKET_NAME: 'private-photos' });

describe('admin photo previews', () => {
  it('returns short-lived signed previews for hidden photos without raw storage keys or private participant fields', async () => {
    const rpc = vi.fn().mockResolvedValue([{ ...row, email: 'private@example.test' }]);
    const [photo] = await createAdminRepository({ rpc }, signer).listMoments({ eventId, visibility: 'hidden', limit: 30 });
    expect(photo).toMatchObject({ id: momentId, status: 'HIDDEN', participantName: 'Andi' });
    for (const [url, variant] of [[photo.thumbnailUrl, 'thumbnail.jpg'], [photo.displayUrl, 'display.jpg']]) {
      expect(url).toEqual(expect.any(String));
      const signed = new URL(url!);
      expect(signed.pathname).toBe(`/private-photos/${prefix}/${variant}`);
      expect(signed.searchParams.get('X-Amz-Expires')).toBe('300');
      expect(signed.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
    }
    for (const key of ['participantId', 'email', 'r2OriginalKey', 'r2DisplayKey', 'r2ThumbnailKey']) expect(photo).not.toHaveProperty(key);
  });

  it('uses the display derivative when a thumbnail is unavailable', async () => {
    const rpc = vi.fn().mockResolvedValue([{ ...row, r2ThumbnailKey: null }]);
    const [photo] = await createAdminRepository({ rpc }, signer).listMoments({ eventId, visibility: 'recent', limit: 30 });
    expect(new URL(photo.thumbnailUrl!).pathname).toBe(`/private-photos/${prefix}/display.jpg`);
  });

  it('can show a valid thumbnail when no display derivative exists', async () => {
    const rpc = vi.fn().mockResolvedValue([{ ...row, r2DisplayKey: null }]);
    const [photo] = await createAdminRepository({ rpc }, signer).listMoments({ eventId, visibility: 'recent', limit: 30 });
    expect(new URL(photo.thumbnailUrl!).pathname).toBe(`/private-photos/${prefix}/thumbnail.jpg`);
    expect(photo.displayUrl).toBeNull();
  });

  it('does not sign a key belonging to a different event or moment', async () => {
    const rpc = vi.fn().mockResolvedValue([{ ...row, r2DisplayKey: `${prefix.replace(eventId, 'cd928dad-a8c6-40af-a482-30df35ad5e5b')}/display.jpg`, r2ThumbnailKey: `${prefix.replace(momentId, '2ef1d9e5-2d09-4c1e-84dd-9e7c6bb0c219')}/thumbnail.jpg` }]);
    const [photo] = await createAdminRepository({ rpc }, signer).listMoments({ eventId, visibility: 'recent', limit: 30 });
    expect(photo.displayUrl).toBeNull();
    expect(photo.thumbnailUrl).toBeNull();
    expect(photo).not.toHaveProperty('r2OriginalKey');
  });
});
