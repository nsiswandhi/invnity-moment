import { createDatabaseClient, type DatabaseClient } from '../client';
import { assertCompleteMomentMetadata, type CursorPage, type MomentCategory, type MomentObjectMetadata, type MomentRecord } from '../types';

export type MomentLookup = Partial<MomentRecord> & { id: string; eventId?: string; participantId?: string; reservationExpiresAt?: string | null; reservationStatus?: string | null };
export type ReservationResult = { momentId: string; reservationId: string; expiresAt?: string; reservationStatus?: string };

export type MomentDatabase = {
  reserveMomentSlot(input: { participantId: string; eventId: string; reservationId: string; expiresAt: string }): Promise<ReservationResult>;
  getMomentForParticipant(momentId: string, participantId: string): Promise<MomentLookup | null>;
  completeMoment(momentId: string, metadata: MomentObjectMetadata): Promise<MomentRecord>;
  updateOwnedMoment(participantId: string, momentId: string, category: MomentCategory): Promise<MomentRecord>;
  deleteOwnedMoment(participantId: string, momentId: string): Promise<void>;
  listOwnedMoments(participantId: string, cursor: string | null, limit: number): Promise<CursorPage<MomentRecord>>;
};

let configuredDatabase: MomentDatabase | undefined;

function database(): MomentDatabase {
  if (!configuredDatabase) configuredDatabase = createSupabaseMomentDatabase(createDatabaseClient());
  return configuredDatabase;
}

export function configureMomentRepository(client: MomentDatabase | undefined): void { configuredDatabase = client; }

export function createSupabaseMomentDatabase(client: DatabaseClient): MomentDatabase {
  return {
    async reserveMomentSlot(input) {
      const rows = await client.rpc<Array<{ moment_id: string; reservation_id: string; expires_at?: string; reservation_status?: string }>>('reserve_moment_slot', {
        p_participant_id: input.participantId, p_event_id: input.eventId, p_reservation_id: input.reservationId, p_expires_at: input.expiresAt,
      });
      const row = rows[0];
      if (!row) throw new Error('RESERVATION_NOT_CREATED');
      return { momentId: row.moment_id, reservationId: row.reservation_id, expiresAt: row.expires_at, reservationStatus: row.reservation_status };
    },
    getMomentForParticipant(momentId, participantId) {
      return client.rpc<MomentLookup | null>('get_moment_for_participant', { p_moment_id: momentId, p_participant_id: participantId });
    },
    completeMoment(momentId, metadata) {
      return client.rpc<MomentRecord>('complete_moment', { p_moment_id: momentId, p_metadata: metadata });
    },
    updateOwnedMoment(participantId, momentId, category) {
      return client.rpc<MomentRecord>('update_owned_moment', { p_participant_id: participantId, p_moment_id: momentId, p_category: category });
    },
    async deleteOwnedMoment(participantId, momentId) {
      await client.rpc('delete_owned_moment', { p_participant_id: participantId, p_moment_id: momentId });
    },
    listOwnedMoments(participantId, cursor, limit) {
      return client.rpc<CursorPage<MomentRecord>>('list_owned_moments', { p_participant_id: participantId, p_cursor: cursor, p_limit: limit });
    },
  };
}

export async function reserveMomentSlotWithState(participantId: string, eventId: string, reservationId: string, expiresAt: string): Promise<ReservationResult> {
  return database().reserveMomentSlot({ participantId, eventId, reservationId, expiresAt });
}
export async function reserveMomentSlot(participantId: string, eventId: string, reservationId: string, expiresAt: string): Promise<{ momentId: string; reservationId: string }> {
  const result = await reserveMomentSlotWithState(participantId, eventId, reservationId, expiresAt);
  return { momentId: result.momentId, reservationId: result.reservationId };
}
export function getMomentForParticipant(momentId: string, participantId: string): Promise<MomentLookup | null> { return database().getMomentForParticipant(momentId, participantId); }
export function completeMoment(momentId: string, objectMetadata: MomentObjectMetadata): Promise<MomentRecord> {
  assertCompleteMomentMetadata(objectMetadata);
  return database().completeMoment(momentId, objectMetadata);
}
export function updateOwnedMoment(participantId: string, momentId: string, category: MomentCategory): Promise<MomentRecord> { return database().updateOwnedMoment(participantId, momentId, category); }
export function deleteOwnedMoment(participantId: string, momentId: string): Promise<void> { return database().deleteOwnedMoment(participantId, momentId); }
export function listOwnedMoments(participantId: string, cursor: string | null, limit: number): Promise<CursorPage<MomentRecord>> { return database().listOwnedMoments(participantId, cursor, limit); }
