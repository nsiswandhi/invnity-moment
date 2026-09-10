import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from '../../lib/errors/http-error';

const { assertTrustedMutation, clientRateLimitKey, completeUpload, createDownloadAuthorization, createUploadAuthorization, enforceRateLimit, requireParticipant } = vi.hoisted(() => ({
  assertTrustedMutation: vi.fn(), clientRateLimitKey: vi.fn().mockReturnValue('client-key'), completeUpload: vi.fn(), createDownloadAuthorization: vi.fn(), createUploadAuthorization: vi.fn(), enforceRateLimit: vi.fn(), requireParticipant: vi.fn(),
}));

vi.mock('../../lib/auth/csrf', () => ({ assertTrustedMutation }));
vi.mock('../../lib/auth/rate-limits', () => ({ clientRateLimitKey, enforceRateLimit }));
vi.mock('../../lib/auth/session', () => ({ requireParticipant }));
vi.mock('../../lib/media/upload-service', () => ({ completeUpload, createDownloadAuthorization, createUploadAuthorization }));

import { POST as reserve } from '../../app/api/v1/moments/reserve/route';
import { POST as complete } from '../../app/api/v1/moments/[momentId]/complete/route';
import { POST as download } from '../../app/api/v1/moments/[momentId]/download/route';

const eventId = 'bd928dad-a8c6-40af-a482-30df35ad5e5b';
const momentId = '1ef1d9e5-2d09-4c1e-84dd-9e7c6bb0c219';

describe('moment upload routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireParticipant.mockResolvedValue({ id: 'e3a7c9f1-30b0-4f8b-9ad4-5adfc8445e5c', eventId });
    enforceRateLimit.mockResolvedValue(undefined);
    createUploadAuthorization.mockResolvedValue({ momentId });
    completeUpload.mockResolvedValue({ id: momentId });
    createDownloadAuthorization.mockResolvedValue({ downloadUrl: 'https://r2.example.test/signed', expiresAt: '2026-09-10T00:01:00.000Z' });
  });

  it('applies the shared rate limiter to reserve, complete, and download requests', async () => {
    await reserve(new Request('https://moments.example.test/api/v1/moments/reserve', { method: 'POST', body: JSON.stringify({ eventId, contentType: 'image/jpeg' }), headers: { 'content-type': 'application/json' } }));
    await complete(new Request(`https://moments.example.test/api/v1/moments/${momentId}/complete`, { method: 'POST', body: JSON.stringify({ category: 'REUNI' }), headers: { 'content-type': 'application/json' } }), { params: Promise.resolve({ momentId }) });
    await download(new Request(`https://moments.example.test/api/v1/moments/${momentId}/download`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } }), { params: Promise.resolve({ momentId }) });

    expect(enforceRateLimit).toHaveBeenCalledWith('moment-reserve', 'client-key', expect.any(Number), expect.any(Number));
    expect(enforceRateLimit).toHaveBeenCalledWith('moment-complete', 'client-key', expect.any(Number), expect.any(Number));
    expect(enforceRateLimit).toHaveBeenCalledWith('moment-download', 'client-key', expect.any(Number), expect.any(Number));
  });

  it('returns the shared limiter refusal before invoking the reserve service', async () => {
    enforceRateLimit.mockRejectedValueOnce(new HttpError(429, 'RATE_LIMITED', 'Terlalu banyak permintaan. Coba lagi sebentar.'));
    const response = await reserve(new Request('https://moments.example.test/api/v1/moments/reserve', { method: 'POST', body: JSON.stringify({ eventId, contentType: 'image/jpeg' }), headers: { 'content-type': 'application/json' } }));

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: { code: 'RATE_LIMITED' }, request_id: expect.any(String) });
    expect(createUploadAuthorization).not.toHaveBeenCalled();
  });
});
