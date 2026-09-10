import { describe, expect, it, vi } from 'vitest';
import { createSupabaseMomentDatabase } from '../../lib/db/repositories/moments';
import type { DatabaseClient } from '../../lib/db/client';

describe('default moments repository', () => {
  it('uses the shipped reservation RPC and preserves replay metadata', async () => {
    const rpc = vi.fn().mockResolvedValue([{ moment_id: 'moment-1', reservation_id: 'reservation-1', expires_at: '2099-01-01T00:05:00.000Z', reservation_status: 'RESERVED' }]);
    const database = createSupabaseMomentDatabase({ rpc } as DatabaseClient);

    await expect(database.reserveMomentSlot({ participantId: 'participant-1', eventId: 'event-1', reservationId: 'reservation-1', expiresAt: '2099-01-01T00:20:00.000Z' })).resolves.toEqual({
      momentId: 'moment-1', reservationId: 'reservation-1', expiresAt: '2099-01-01T00:05:00.000Z', reservationStatus: 'RESERVED',
    });
    expect(rpc).toHaveBeenCalledWith('reserve_moment_slot', {
      p_participant_id: 'participant-1', p_event_id: 'event-1', p_reservation_id: 'reservation-1', p_expires_at: '2099-01-01T00:20:00.000Z',
    });
  });

  it('uses the participant-scoped moment lookup RPC on the default path', async () => {
    const context = { id: 'moment-1', participantId: 'participant-1', eventId: 'event-1', status: 'RESERVED', reservationStatus: 'RESERVED', reservationExpiresAt: '2099-01-01T00:05:00.000Z' };
    const rpc = vi.fn().mockResolvedValue(context);
    const database = createSupabaseMomentDatabase({ rpc } as DatabaseClient);

    await expect(database.getMomentForParticipant('moment-1', 'participant-1')).resolves.toEqual(context);
    expect(rpc).toHaveBeenCalledWith('get_moment_for_participant', { p_moment_id: 'moment-1', p_participant_id: 'participant-1' });
  });
});
