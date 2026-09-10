import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from '../../lib/errors/http-error';

const { assertTrustedMutation, clientRateLimitKey, deleteOwnedMoment, enforceRateLimit, listOwnedMoments, requireParticipant, updateOwnedMoment } = vi.hoisted(() => ({
  assertTrustedMutation: vi.fn(),
  clientRateLimitKey: vi.fn().mockReturnValue('participant-client'),
  deleteOwnedMoment: vi.fn(),
  enforceRateLimit: vi.fn(),
  listOwnedMoments: vi.fn(),
  requireParticipant: vi.fn(),
  updateOwnedMoment: vi.fn(),
}));

vi.mock('../../lib/auth/csrf', () => ({ assertTrustedMutation }));
vi.mock('../../lib/auth/rate-limits', () => ({ clientRateLimitKey, enforceRateLimit }));
vi.mock('../../lib/auth/session', () => ({ requireParticipant }));
vi.mock('../../lib/db/repositories/moments', () => ({ deleteOwnedMoment, listOwnedMoments, updateOwnedMoment }));

import { GET } from '../../app/api/v1/me/moments/route';
import { DELETE, PATCH } from '../../app/api/v1/me/moments/[momentId]/route';

const momentId = '1ef1d9e5-2d09-4c1e-84dd-9e7c6bb0c219';
const participant = { id: 'e3a7c9f1-30b0-4f8b-9ad4-5adfc8445e5c', eventId: 'bd928dad-a8c6-40af-a482-30df35ad5e5b', name: 'Sari', batch: 'IA 5', status: 'active' };
const moment = { id: momentId, participantId: participant.id, eventId: participant.eventId, status: 'PUBLISHED', category: 'REUNI', r2OriginalKey: 'original', r2DisplayKey: 'display', r2ThumbnailKey: 'thumbnail', mimeType: 'image/jpeg', byteSize: 100, width: 10, height: 10, createdAt: '2026-09-10T00:00:00.000Z', publishedAt: '2026-09-10T00:00:00.000Z', deletedAt: null };

describe('participant-owned moment routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireParticipant.mockResolvedValue(participant);
    enforceRateLimit.mockResolvedValue(undefined);
    listOwnedMoments.mockResolvedValue({ data: [moment], nextCursor: 'next-cursor' });
    updateOwnedMoment.mockResolvedValue({ ...moment, category: 'FESTIVAL' });
    deleteOwnedMoment.mockResolvedValue(undefined);
  });

  it('lists only the authenticated participant moments using the requested cursor', async () => {
    const response = await GET(new Request('https://moments.example.test/api/v1/me/moments?cursor=cursor-1&limit=2'));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { data: [expect.objectContaining({ id: momentId })], nextCursor: 'next-cursor' } });
    expect(listOwnedMoments).toHaveBeenCalledWith(participant.id, 'cursor-1', 2);
  });

  it('rejects malformed cursors and limits before touching the repository', async () => {
    const response = await GET(new Request('https://moments.example.test/api/v1/me/moments?cursor=&limit=51'));

    expect(response.status).toBe(400);
    expect(listOwnedMoments).not.toHaveBeenCalled();
  });

  it('does not expose moments when authentication fails', async () => {
    requireParticipant.mockRejectedValueOnce(new HttpError(401, 'UNAUTHENTICATED', 'Masuk dulu.'));

    const response = await GET(new Request('https://moments.example.test/api/v1/me/moments'));

    expect(response.status).toBe(401);
    expect(listOwnedMoments).not.toHaveBeenCalled();
  });

  it('updates an owned category only after authentication and CSRF validation', async () => {
    const response = await PATCH(new Request(`https://moments.example.test/api/v1/me/moments/${momentId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ category: 'FESTIVAL' }) }), { params: Promise.resolve({ momentId }) });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { moment: { id: momentId, category: 'FESTIVAL' } } });
    expect(assertTrustedMutation).toHaveBeenCalled();
    expect(updateOwnedMoment).toHaveBeenCalledWith(participant.id, momentId, 'FESTIVAL');
  });

  it('does not report a successful category mutation when the repository fails', async () => {
    updateOwnedMoment.mockRejectedValueOnce(new HttpError(409, 'MOMENT_NOT_FOUND', 'Momen tidak ditemukan.'));

    const response = await PATCH(new Request(`https://moments.example.test/api/v1/me/moments/${momentId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ category: 'FESTIVAL' }) }), { params: Promise.resolve({ momentId }) });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'MOMENT_NOT_FOUND' } });
  });

  it('soft-deletes an owned moment and reports a repository refusal instead of success', async () => {
    const deleted = await DELETE(new Request(`https://moments.example.test/api/v1/me/moments/${momentId}`, { method: 'DELETE' }), { params: Promise.resolve({ momentId }) });
    expect(deleted.status).toBe(200);
    expect(deleteOwnedMoment).toHaveBeenCalledWith(participant.id, momentId);

    deleteOwnedMoment.mockRejectedValueOnce(new HttpError(404, 'MOMENT_NOT_FOUND', 'Momen tidak ditemukan.'));
    const refused = await DELETE(new Request(`https://moments.example.test/api/v1/me/moments/${momentId}`, { method: 'DELETE' }), { params: Promise.resolve({ momentId }) });
    expect(refused.status).toBe(404);
    expect(await refused.json()).toMatchObject({ error: { code: 'MOMENT_NOT_FOUND' } });
  });

  it('requires CSRF validation for both mutations', async () => {
    assertTrustedMutation.mockImplementationOnce(() => { throw new HttpError(403, 'CSRF_INVALID', 'Permintaan tidak valid.'); });
    const patchResponse = await PATCH(new Request(`https://moments.example.test/api/v1/me/moments/${momentId}`, { method: 'PATCH', body: JSON.stringify({ category: 'FESTIVAL' }) }), { params: Promise.resolve({ momentId }) });
    expect(patchResponse.status).toBe(403);

    assertTrustedMutation.mockImplementationOnce(() => { throw new HttpError(403, 'CSRF_INVALID', 'Permintaan tidak valid.'); });
    const deleteResponse = await DELETE(new Request(`https://moments.example.test/api/v1/me/moments/${momentId}`, { method: 'DELETE' }), { params: Promise.resolve({ momentId }) });
    expect(deleteResponse.status).toBe(403);
  });
});
