import { NextResponse } from 'next/server';
import { apiError, requestId } from '../../../../lib/auth/http';
import { requireParticipant } from '../../../../lib/auth/session';
import { createDatabaseClient } from '../../../../lib/db/client';

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    const participant = await requireParticipant(request);
    const summary = await createDatabaseClient().rpc<{ activeMoments: number; maxActiveMoments: number }>('get_participant_quota_summary', { p_participant_id: participant.id });
    return NextResponse.json({ data: { participant: { id: participant.id, eventId: participant.eventId, name: participant.name, batch: participant.batch }, quota: summary }, request_id: id });
  } catch (error) {
    return apiError(error, id);
  }
}
