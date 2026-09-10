import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureMomentRepository, type MomentDatabase } from '../../lib/db/repositories/moments';
import {
  completeUpload,
  createDownloadAuthorization,
  createUploadAuthorization,
  isOrphanCleanupEligible,
  isUploadAuthorizationExpired,
  type UploadServiceDependencies,
} from '../../lib/media/upload-service';

const momentId = '1ef1d9e5-2d09-4c1e-84dd-9e7c6bb0c219';
const participantId = 'e3a7c9f1-30b0-4f8b-9ad4-5adfc8445e5c';
const eventId = 'bd928dad-a8c6-40af-a482-30df35ad5e5b';
const now = new Date('2026-09-10T00:00:00.000Z');

afterEach(() => {
  configureMomentRepository(undefined);
  vi.unstubAllGlobals();
});

describe('direct R2 upload flow', () => {
  it('recognizes an expired upload authorization', () => {
    expect(isUploadAuthorizationExpired('2026-09-10T00:00:00.000Z', now)).toBe(true);
    expect(isUploadAuthorizationExpired('2026-09-10T00:05:00.000Z', now)).toBe(false);
  });

  it('returns a scoped PUT authorization without accepting image bytes', async () => {
    const dependencies: UploadServiceDependencies = {
      reserve: async () => ({ momentId, reservationId: '4e9f3f9e-fb68-4093-9e6d-e3dbf47d92de', expiresAt: '2026-09-10T00:10:00.000Z' }),
      presignPut: async (key, input) => {
        expect(key).toContain(`/moments/${momentId}/original`);
        expect(input.contentType).toBe('image/jpeg');
        return 'https://r2.example.test/signed-put';
      },
    };

    await expect(createUploadAuthorization({ eventId, participantId, contentType: 'image/jpeg', now }, dependencies)).resolves.toMatchObject({
      momentId,
      uploadUrl: 'https://r2.example.test/signed-put',
      expiresAt: '2026-09-10T00:10:00.000Z',
    });
  });

  it('uses the default repository and R2 presigner when dependencies are not injected', async () => {
    const originalEnvironment = { ...process.env };
    Object.assign(process.env, { R2_ACCOUNT_ID: 'account-id', R2_ACCESS_KEY_ID: 'access-key', R2_SECRET_ACCESS_KEY: 'secret-key', R2_BUCKET_NAME: 'private-moments' });
    const database: MomentDatabase = {
      reserveMomentSlot: async () => ({ momentId, reservationId: '4e9f3f9e-fb68-4093-9e6d-e3dbf47d92de', expiresAt: '2026-09-10T00:10:00.000Z', reservationStatus: 'RESERVED' }),
      getMomentForParticipant: async () => null,
      completeMoment: async () => { throw new Error('not used'); },
      updateOwnedMoment: async () => { throw new Error('not used'); },
      deleteOwnedMoment: async () => undefined,
      listOwnedMoments: async () => ({ data: [], nextCursor: null }),
    };
    configureMomentRepository(database);
    try {
      const authorization = await createUploadAuthorization({ eventId, participantId, contentType: 'image/jpeg', now });
      expect(authorization.uploadUrl).toContain('https://account-id.r2.cloudflarestorage.com/private-moments/');
      expect(authorization.uploadUrl).toContain('X-Amz-Expires=600');
    } finally {
      for (const name of Object.keys(process.env)) if (!(name in originalEnvironment)) delete process.env[name];
      Object.assign(process.env, originalEnvironment);
    }
  });

  it('does not sign an upload after the reservation has expired', async () => {
    let signed = false;
    const dependencies: UploadServiceDependencies = {
      reserve: async () => ({ momentId, reservationId: '4e9f3f9e-fb68-4093-9e6d-e3dbf47d92de', expiresAt: '2026-09-09T23:59:59.000Z' }),
      presignPut: async () => { signed = true; return 'https://r2.example.test/signed-put'; },
    };

    await expect(createUploadAuthorization({ eventId, participantId, contentType: 'image/jpeg', now }, dependencies)).rejects.toMatchObject({ code: 'UPLOAD_AUTHORIZATION_EXPIRED', status: 409 });
    expect(signed).toBe(false);
  });

  it('does not sign a replayed reservation that is no longer active', async () => {
    let signed = false;
    const dependencies: UploadServiceDependencies = {
      reserve: async () => ({ momentId, reservationId: '4e9f3f9e-fb68-4093-9e6d-e3dbf47d92de', expiresAt: '2026-09-10T00:05:00.000Z', reservationStatus: 'CANCELLED' }),
      presignPut: async () => { signed = true; return 'https://r2.example.test/signed-put'; },
    };

    await expect(createUploadAuthorization({ eventId, participantId, contentType: 'image/jpeg', now }, dependencies)).rejects.toMatchObject({ code: 'RESERVATION_NOT_ACTIVE', status: 409 });
    expect(signed).toBe(false);
  });

  it('uses the persisted active replay expiry to bound the signed PUT URL', async () => {
    let signedFor = 0;
    const dependencies: UploadServiceDependencies = {
      reserve: async () => ({ momentId, reservationId: '4e9f3f9e-fb68-4093-9e6d-e3dbf47d92de', expiresAt: '2026-09-10T00:00:30.000Z', reservationStatus: 'RESERVED' }),
      presignPut: async (_key, input) => { signedFor = input.expiresInSeconds; return 'https://r2.example.test/signed-put'; },
    };

    await expect(createUploadAuthorization({ eventId, participantId, contentType: 'image/jpeg', now }, dependencies)).resolves.toMatchObject({ expiresAt: '2026-09-10T00:00:30.000Z' });
    expect(signedFor).toBe(30);
  });

  it('does not read R2 again when completion is replayed for a published moment', async () => {
    const readObject = async () => { throw new Error('R2 should not be read for an idempotent replay'); };
    const published = { id: momentId, eventId, participantId, status: 'PUBLISHED' as const };
    const dependencies: UploadServiceDependencies = {
      getMoment: async () => published,
      readObject,
      complete: async () => published,
    };

    await expect(completeUpload({ momentId, participantId, category: 'REUNI', now }, dependencies)).resolves.toEqual(published);
  });

  it('cancels an inactive reservation before reading its object', async () => {
    let cancelled = false;
    let read = false;
    const dependencies: UploadServiceDependencies = {
      getMoment: async () => ({ id: momentId, eventId, participantId, status: 'RESERVED', reservationStatus: 'EXPIRED', reservationExpiresAt: '2026-09-10T00:05:00.000Z' }),
      readObject: async () => { read = true; throw new Error('object should not be read'); },
      cancel: async () => { cancelled = true; },
    };

    await expect(completeUpload({ momentId, participantId, category: 'REUNI', now }, dependencies)).rejects.toMatchObject({ code: 'RESERVATION_NOT_ACTIVE', status: 409 });
    expect(cancelled).toBe(true);
    expect(read).toBe(false);
  });

  it('refuses downloads when the stored key is not a managed moment object', async () => {
    const dependencies: UploadServiceDependencies = {
      getMoment: async () => ({ id: momentId, eventId, participantId, status: 'PUBLISHED', r2DisplayKey: 'private/not-managed.jpg' }),
      presignGet: async () => 'https://r2.example.test/signed-get',
    };

    await expect(createDownloadAuthorization({ momentId, participantId, now }, dependencies)).rejects.toMatchObject({ code: 'INVALID_OBJECT_KEY_SCOPE', status: 422 });
  });

  it('marks an old unreferenced object as eligible for orphan cleanup', () => {
    expect(isOrphanCleanupEligible({ key: `events/${eventId}/participants/${participantId}/moments/${momentId}/original`, createdAt: '2026-09-09T00:00:00.000Z', referenced: false }, now, 60 * 60 * 1000)).toBe(true);
    expect(isOrphanCleanupEligible({ key: `events/${eventId}/participants/${participantId}/moments/${momentId}/original`, createdAt: '2026-09-09T23:30:00.000Z', referenced: false }, now, 60 * 60 * 1000)).toBe(false);
    expect(isOrphanCleanupEligible({ key: `events/${eventId}/participants/${participantId}/moments/${momentId}/original`, createdAt: '2026-09-09T00:00:00.000Z', referenced: true }, now, 60 * 60 * 1000)).toBe(false);
  });
});
