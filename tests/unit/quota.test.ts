import { beforeEach, describe, expect, it } from 'vitest';
import type { MomentRecord } from '../../lib/db/types';
import {
  completeMoment,
  configureMomentRepository,
  deleteOwnedMoment,
  listOwnedMoments,
  reserveMomentSlot,
  type MomentDatabase,
} from '../../lib/db/repositories/moments';

type StoredMoment = MomentRecord;
type Reservation = { id: string; participantId: string; eventId: string; momentId: string; expiresAt: string; status: 'RESERVED' | 'COMPLETED' | 'CANCELLED' };

function memoryDatabase(activeMoments = 0): MomentDatabase & { moments: StoredMoment[]; reservations: Reservation[] } {
  const moments: StoredMoment[] = Array.from({ length: activeMoments }, (_, index) => ({
    id: `existing-${index}`, participantId: 'participant-1', eventId: 'event-1', status: 'PUBLISHED', category: 'MOMEN_KITA',
    r2OriginalKey: `events/event-1/moments/existing-${index}/original.jpg`, r2DisplayKey: `events/event-1/moments/existing-${index}/display.jpg`,
    r2ThumbnailKey: `events/event-1/moments/existing-${index}/thumbnail.jpg`, mimeType: 'image/jpeg', byteSize: 100, width: 10, height: 20,
    createdAt: '2026-09-09T00:00:00.000Z', publishedAt: '2026-09-09T00:00:00.000Z', deletedAt: null,
  }));
  const reservations: Reservation[] = [];
  return {
    moments,
    reservations,
    async reserveMomentSlot(input) {
      const replay = reservations.find((reservation) => reservation.id === input.reservationId && reservation.participantId === input.participantId && reservation.eventId === input.eventId);
      if (replay) {
        if (replay.status !== 'RESERVED' || new Date(replay.expiresAt) <= new Date()) throw new Error('RESERVATION_NOT_ACTIVE');
        return { momentId: replay.momentId, reservationId: replay.id, expiresAt: replay.expiresAt, reservationStatus: replay.status };
      }
      const now = new Date();
      const used = moments.filter((moment) => moment.participantId === input.participantId && moment.deletedAt === null && moment.status !== 'REJECTED' && moment.status !== 'RESERVED').length
        + reservations.filter((reservation) => reservation.participantId === input.participantId && reservation.status === 'RESERVED' && new Date(reservation.expiresAt) > now).length;
      if (used >= 10) throw new Error('QUOTA_EXCEEDED');
      const momentId = `moment-${moments.length}`;
      moments.push({
        id: momentId, participantId: input.participantId, eventId: input.eventId, status: 'RESERVED', category: 'MOMEN_KITA',
        r2OriginalKey: `events/${input.eventId}/moments/${momentId}/original.jpg`, r2DisplayKey: null, r2ThumbnailKey: null,
        mimeType: 'image/jpeg', byteSize: 0, width: 0, height: 0, createdAt: '2026-09-09T00:00:00.000Z', publishedAt: null, deletedAt: null,
      });
      reservations.push({ id: input.reservationId, participantId: input.participantId, eventId: input.eventId, momentId, expiresAt: input.expiresAt, status: 'RESERVED' });
      return { momentId, reservationId: input.reservationId, expiresAt: input.expiresAt, reservationStatus: 'RESERVED' };
    },
    async getMomentForParticipant(momentId, participantId) {
      const moment = moments.find((item) => item.id === momentId && item.participantId === participantId);
      if (!moment) return null;
      const reservation = reservations.find((item) => item.momentId === momentId);
      return { ...moment, reservationExpiresAt: reservation?.expiresAt, reservationStatus: reservation?.status };
    },
    async completeMoment(momentId, metadata) {
      const moment = moments.find((item) => item.id === momentId);
      if (!moment) throw new Error('MOMENT_NOT_FOUND');
      if (moment.status === 'PUBLISHED') return { ...moment };
      const reservation = reservations.find((item) => item.momentId === momentId);
      if (!reservation || reservation.status !== 'RESERVED' || new Date(reservation.expiresAt) <= new Date() || moment.deletedAt !== null) throw new Error('RESERVATION_NOT_ACTIVE');
      Object.assign(moment, metadata, { status: 'PUBLISHED', publishedAt: '2026-09-09T00:00:00.000Z' });
      reservation.status = 'COMPLETED';
      return { ...moment };
    },
    async updateOwnedMoment(participantId, momentId, category) {
      const moment = moments.find((item) => item.id === momentId && item.participantId === participantId && item.deletedAt === null);
      if (!moment) throw new Error('MOMENT_NOT_FOUND');
      moment.category = category;
      return { ...moment };
    },
    async deleteOwnedMoment(participantId, momentId) {
      const moment = moments.find((item) => item.id === momentId && item.participantId === participantId);
      if (!moment) throw new Error('MOMENT_NOT_FOUND');
      moment.deletedAt = '2026-09-09T00:00:00.000Z';
      reservations.filter((reservation) => reservation.momentId === momentId && reservation.status === 'RESERVED').forEach((reservation) => { reservation.status = 'CANCELLED'; });
    },
    async listOwnedMoments(participantId, cursor, limit) {
      const start = cursor ? Number(cursor) : 0;
      const owned = moments.filter((moment) => moment.participantId === participantId && moment.deletedAt === null);
      const data = owned.slice(start, start + limit);
      return { data, nextCursor: start + data.length < owned.length ? String(start + data.length) : null };
    },
  };
}

describe('moment quota', () => {
  beforeEach(() => configureMomentRepository(memoryDatabase()));

  it('reserves the first slot at 0/10', async () => {
    const result = await reserveMomentSlot('participant-1', 'event-1', 'reservation-1', '2099-01-01T00:00:00.000Z');
    expect(result).toEqual({ momentId: 'moment-0', reservationId: 'reservation-1' });
  });

  it('reserves the tenth slot at 9/10', async () => {
    configureMomentRepository(memoryDatabase(9));
    await expect(reserveMomentSlot('participant-1', 'event-1', 'reservation-10', '2099-01-01T00:00:00.000Z')).resolves.toMatchObject({ reservationId: 'reservation-10' });
  });

  it('rejects a reservation at 10/10', async () => {
    configureMomentRepository(memoryDatabase(10));
    await expect(reserveMomentSlot('participant-1', 'event-1', 'reservation-11', '2099-01-01T00:00:00.000Z')).rejects.toThrow('QUOTA_EXCEEDED');
  });

  it('releases a slot after an owned soft delete at 10/10', async () => {
    const database = memoryDatabase(10);
    configureMomentRepository(database);
    await deleteOwnedMoment('participant-1', 'existing-0');
    await expect(reserveMomentSlot('participant-1', 'event-1', 'reservation-reused', '2099-01-01T00:00:00.000Z')).resolves.toMatchObject({ reservationId: 'reservation-reused' });
    expect(database.moments[0].deletedAt).not.toBeNull();
  });

  it('does not count an expired reservation', async () => {
    const database = memoryDatabase(9);
    database.reservations.push({ id: 'expired', participantId: 'participant-1', eventId: 'event-1', momentId: 'orphan', expiresAt: '2000-01-01T00:00:00.000Z', status: 'RESERVED' });
    configureMomentRepository(database);
    await expect(reserveMomentSlot('participant-1', 'event-1', 'reservation-after-expiry', '2099-01-01T00:00:00.000Z')).resolves.toMatchObject({ reservationId: 'reservation-after-expiry' });
  });

  it('rejects completion of an expired reservation after its slot is reused', async () => {
    configureMomentRepository(memoryDatabase(9));
    const expired = await reserveMomentSlot('participant-1', 'event-1', 'expired-completion', '2000-01-01T00:00:00.000Z');
    await expect(reserveMomentSlot('participant-1', 'event-1', 'replacement-after-expiry', '2099-01-01T00:00:00.000Z')).resolves.toMatchObject({ reservationId: 'replacement-after-expiry' });

    await expect(completeMoment(expired.momentId, {
      category: 'REUNI', r2OriginalKey: 'expired-original', r2DisplayKey: 'expired-display', r2ThumbnailKey: 'expired-thumbnail',
      mimeType: 'image/jpeg', byteSize: 100, width: 10, height: 20,
    })).rejects.toThrow('RESERVATION_NOT_ACTIVE');
  });

  it('cancels a deleted reserved slot before allowing its replacement', async () => {
    configureMomentRepository(memoryDatabase(9));
    const reserved = await reserveMomentSlot('participant-1', 'event-1', 'delete-reserved', '2099-01-01T00:00:00.000Z');
    await deleteOwnedMoment('participant-1', reserved.momentId);
    await expect(reserveMomentSlot('participant-1', 'event-1', 'replacement-after-delete', '2099-01-01T00:00:00.000Z')).resolves.toMatchObject({ reservationId: 'replacement-after-delete' });
    await expect(completeMoment(reserved.momentId, {
      category: 'REUNI', r2OriginalKey: 'deleted-original', r2DisplayKey: 'deleted-display', r2ThumbnailKey: 'deleted-thumbnail',
      mimeType: 'image/jpeg', byteSize: 100, width: 10, height: 20,
    })).rejects.toThrow('RESERVATION_NOT_ACTIVE');
  });

  it('scopes reservation-id replay to the participant and event', async () => {
    const first = await reserveMomentSlot('participant-1', 'event-1', 'reused-client-id', '2099-01-01T00:00:00.000Z');
    const second = await reserveMomentSlot('participant-2', 'event-2', 'reused-client-id', '2099-01-01T00:00:00.000Z');

    expect(second.momentId).not.toBe(first.momentId);
  });

  it('does not replay an expired reservation ID into a fresh active slot', async () => {
    const database = memoryDatabase();
    database.reservations.push({ id: 'expired-replay', participantId: 'participant-1', eventId: 'event-1', momentId: 'expired-moment', expiresAt: '2000-01-01T00:00:00.000Z', status: 'RESERVED' });
    configureMomentRepository(database);

    await expect(reserveMomentSlot('participant-1', 'event-1', 'expired-replay', '2099-01-01T00:00:00.000Z')).rejects.toThrow('RESERVATION_NOT_ACTIVE');
    expect(database.moments).toHaveLength(0);
  });

  it('returns the persisted active expiry when a reservation ID is replayed', async () => {
    const database = memoryDatabase();
    configureMomentRepository(database);
    const first = await reserveMomentSlot('participant-1', 'event-1', 'active-replay', '2099-01-01T00:10:00.000Z');
    database.reservations[0].expiresAt = '2099-01-01T00:05:00.000Z';

    await expect((await import('../../lib/db/repositories/moments')).reserveMomentSlotWithState('participant-1', 'event-1', 'active-replay', '2099-01-01T00:20:00.000Z')).resolves.toMatchObject({
      momentId: first.momentId,
      reservationId: 'active-replay',
      expiresAt: '2099-01-01T00:05:00.000Z',
      reservationStatus: 'RESERVED',
    });
  });

  it('allows only one of two concurrent reservations at 9/10', async () => {
    configureMomentRepository(memoryDatabase(9));
    const results = await Promise.allSettled([
      reserveMomentSlot('participant-1', 'event-1', 'concurrent-a', '2099-01-01T00:00:00.000Z'),
      reserveMomentSlot('participant-1', 'event-1', 'concurrent-b', '2099-01-01T00:00:00.000Z'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });

  it('completes idempotently and returns owned moments by cursor', async () => {
    const { momentId } = await reserveMomentSlot('participant-1', 'event-1', 'complete-me', '2099-01-01T00:00:00.000Z');
    const metadata = { category: 'REUNI' as const, r2OriginalKey: 'original', r2DisplayKey: 'display', r2ThumbnailKey: 'thumbnail', mimeType: 'image/jpeg', byteSize: 100, width: 10, height: 20 };
    await expect(completeMoment(momentId, metadata)).resolves.toMatchObject({ id: momentId, status: 'PUBLISHED' });
    await expect(completeMoment(momentId, metadata)).resolves.toMatchObject({ id: momentId, status: 'PUBLISHED' });
    await expect(listOwnedMoments('participant-1', null, 10)).resolves.toMatchObject({ data: [expect.objectContaining({ id: momentId })] });
  });

  it('preserves completed metadata when completion is replayed', async () => {
    const { momentId } = await reserveMomentSlot('participant-1', 'event-1', 'preserve-completion', '2099-01-01T00:00:00.000Z');
    await completeMoment(momentId, {
      category: 'REUNI', r2OriginalKey: 'first-original', r2DisplayKey: 'first-display', r2ThumbnailKey: 'first-thumbnail',
      mimeType: 'image/jpeg', byteSize: 100, width: 10, height: 20,
    });

    await expect(completeMoment(momentId, {
      category: 'FESTIVAL', r2OriginalKey: 'replayed-original', r2DisplayKey: 'replayed-display', r2ThumbnailKey: 'replayed-thumbnail',
      mimeType: 'image/webp', byteSize: 200, width: 30, height: 40,
    })).resolves.toMatchObject({
      category: 'REUNI', r2OriginalKey: 'first-original', r2DisplayKey: 'first-display', r2ThumbnailKey: 'first-thumbnail',
      mimeType: 'image/jpeg', byteSize: 100, width: 10, height: 20,
    });
  });

  it('rejects incomplete completion metadata before publishing', async () => {
    const { momentId } = await reserveMomentSlot('participant-1', 'event-1', 'invalid-metadata', '2099-01-01T00:00:00.000Z');

    expect(() => completeMoment(momentId, {
      category: 'REUNI', r2OriginalKey: '', r2DisplayKey: null, r2ThumbnailKey: null,
      mimeType: 'not-an-image', byteSize: 0, width: 0, height: 0,
    })).toThrow('INVALID_MOMENT_METADATA');
  });

  it('excludes soft-deleted moments from the owned list', async () => {
    const { momentId } = await reserveMomentSlot('participant-1', 'event-1', 'deleted-list-item', '2099-01-01T00:00:00.000Z');
    await deleteOwnedMoment('participant-1', momentId);

    await expect(listOwnedMoments('participant-1', null, 10)).resolves.toEqual({ data: [], nextCursor: null });
  });
});
