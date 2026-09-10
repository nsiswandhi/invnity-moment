import { createDatabaseClient, type DatabaseClient } from '../client';

export type ParticipantRecord = { id: string; eventId: string; name: string; batch: string; email: string; status: string };

export async function getParticipantForEvent(participantId: string, eventId: string, client: DatabaseClient = createDatabaseClient()): Promise<ParticipantRecord | null> {
  return client.rpc<ParticipantRecord | null>('get_participant_for_event', { p_participant_id: participantId, p_event_id: eventId });
}
