import { describe, expect, it } from 'vitest';
import { buildMomentObjectKeys, derivativeKey } from '../../lib/media/object-keys';

const scope = {
  eventId: 'bd928dad-a8c6-40af-a482-30df35ad5e5b',
  participantId: 'e3a7c9f1-30b0-4f8b-9ad4-5adfc8445e5c',
  momentId: '1ef1d9e5-2d09-4c1e-84dd-9e7c6bb0c219',
};

describe('moment object keys', () => {
  it('builds deterministic isolated original and derivative keys', () => {
    expect(buildMomentObjectKeys(scope)).toEqual({
      original: `events/${scope.eventId}/participants/${scope.participantId}/moments/${scope.momentId}/original`,
      display: `events/${scope.eventId}/participants/${scope.participantId}/moments/${scope.momentId}/display.jpg`,
      thumbnail: `events/${scope.eventId}/participants/${scope.participantId}/moments/${scope.momentId}/thumbnail.jpg`,
    });
    expect(buildMomentObjectKeys(scope)).toEqual(buildMomentObjectKeys(scope));
  });

  it('rejects traversal and user-controlled path components', () => {
    expect(() => buildMomentObjectKeys({ ...scope, eventId: '../other-event' })).toThrowError();
    expect(() => buildMomentObjectKeys({ ...scope, participantId: 'participant/other' })).toThrowError();
    expect(() => buildMomentObjectKeys({ ...scope, momentId: 'not-a-uuid' })).toThrowError();
  });

  it('rejects derivative generation for an unmanaged key', () => {
    expect(() => derivativeKey('events/not-a-uuid/participants/not-a-uuid/moments/not-a-uuid/original', 'display')).toThrowError();
  });
});
