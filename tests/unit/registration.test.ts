import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPublicEventSlug } from '../../lib/event-config';

describe('registration client configuration', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('evaluates the registration route from a valid slug when the event UUID is unavailable', async () => {
    vi.stubEnv('NEXT_PUBLIC_EVENT_ID', '');
    vi.stubEnv('NEXT_PUBLIC_EVENT_SLUG', ' reuni-akbar-ia5-2026 ');

    expect(getPublicEventSlug()).toBe('reuni-akbar-ia5-2026');
  });

  it('leaves the registration route unconfigured for a malformed slug', async () => {
    vi.stubEnv('NEXT_PUBLIC_EVENT_ID', '');
    vi.stubEnv('NEXT_PUBLIC_EVENT_SLUG', 'Reuni Akbar');

    expect(() => getPublicEventSlug()).toThrow('NEXT_PUBLIC_EVENT_SLUG');
  });
});
