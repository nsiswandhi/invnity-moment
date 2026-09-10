import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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

  it('keeps the default slug read direct for client bundler inlining', () => {
    const source = readFileSync(fileURLToPath(new URL('../../lib/event-config.ts', import.meta.url)), 'utf8');

    expect(source).toContain('NEXT_PUBLIC_EVENT_SLUG: process.env.NEXT_PUBLIC_EVENT_SLUG');
  });
});
