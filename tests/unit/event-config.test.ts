import { describe, expect, it } from 'vitest';
import { getPublicEventConfig } from '../../lib/event-config';

describe('public event configuration', () => {
  it('requires one matching public event ID and slug for registration and recovery', () => {
    expect(getPublicEventConfig({ NEXT_PUBLIC_EVENT_ID: 'bd928dad-a8c6-40af-a482-30df35ad5e5b', NEXT_PUBLIC_EVENT_SLUG: 'reuni-akbar-ia5-2026' })).toEqual({
      eventId: 'bd928dad-a8c6-40af-a482-30df35ad5e5b', eventSlug: 'reuni-akbar-ia5-2026',
    });
    expect(() => getPublicEventConfig({ NEXT_PUBLIC_EVENT_ID: '', NEXT_PUBLIC_EVENT_SLUG: 'reuni-akbar-ia5-2026' })).toThrow('NEXT_PUBLIC_EVENT_ID');
  });

  it('provides one authoritative route configuration for both participant flows', async () => {
    const { getParticipantEventConfig } = await import('../../lib/event-config');
    expect(getParticipantEventConfig({ NEXT_PUBLIC_EVENT_ID: 'bd928dad-a8c6-40af-a482-30df35ad5e5b', NEXT_PUBLIC_EVENT_SLUG: 'reuni-akbar-ia5-2026' })).toEqual({
      eventId: 'bd928dad-a8c6-40af-a482-30df35ad5e5b', eventSlug: 'reuni-akbar-ia5-2026',
    });
  });
});
