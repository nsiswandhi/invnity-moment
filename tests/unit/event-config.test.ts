import { describe, expect, it } from 'vitest';
import { getPublicEventConfig, getPublicEventSlug } from '../../lib/event-config';

describe('public event configuration', () => {
  it('requires one matching public event ID and slug for registration and recovery', () => {
    expect(getPublicEventConfig({ NEXT_PUBLIC_EVENT_ID: 'bd928dad-a8c6-40af-a482-30df35ad5e5b', NEXT_PUBLIC_EVENT_SLUG: 'reuni-akbar-ia5-2026' })).toEqual({
      eventId: 'bd928dad-a8c6-40af-a482-30df35ad5e5b', eventSlug: 'reuni-akbar-ia5-2026',
    });
    expect(() => getPublicEventConfig({ NEXT_PUBLIC_EVENT_ID: '', NEXT_PUBLIC_EVENT_SLUG: 'reuni-akbar-ia5-2026' })).toThrow('NEXT_PUBLIC_EVENT_ID');
  });

  it('normalizes surrounding whitespace while preserving strict UUID validation', () => {
    expect(getPublicEventConfig({ NEXT_PUBLIC_EVENT_ID: ' bd928dad-a8c6-40af-a482-30df35ad5e5b ', NEXT_PUBLIC_EVENT_SLUG: ' reuni-akbar-ia5-2026 ' })).toEqual({
      eventId: 'bd928dad-a8c6-40af-a482-30df35ad5e5b', eventSlug: 'reuni-akbar-ia5-2026',
    });
    expect(() => getPublicEventConfig({ NEXT_PUBLIC_EVENT_ID: ' not-a-uuid ', NEXT_PUBLIC_EVENT_SLUG: 'reuni-akbar-ia5-2026' })).toThrow('NEXT_PUBLIC_EVENT_ID');
  });

  it('accepts a valid registration slug without requiring an event UUID', () => {
    expect(getPublicEventSlug({ NEXT_PUBLIC_EVENT_SLUG: ' reuni-akbar-ia5-2026 ' })).toBe('reuni-akbar-ia5-2026');
  });

  it('rejects a malformed registration slug', () => {
    expect(() => getPublicEventSlug({ NEXT_PUBLIC_EVENT_SLUG: ' Reuni Akbar ' })).toThrow('NEXT_PUBLIC_EVENT_SLUG');
  });

  it('provides one authoritative route configuration for both participant flows', async () => {
    const { getParticipantEventConfig } = await import('../../lib/event-config');
    expect(getParticipantEventConfig({ NEXT_PUBLIC_EVENT_ID: 'bd928dad-a8c6-40af-a482-30df35ad5e5b', NEXT_PUBLIC_EVENT_SLUG: 'reuni-akbar-ia5-2026' })).toEqual({
      eventId: 'bd928dad-a8c6-40af-a482-30df35ad5e5b', eventSlug: 'reuni-akbar-ia5-2026',
    });
  });
});
