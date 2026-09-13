import { afterEach, describe, expect, it, vi } from 'vitest';
import { trackClientEvent } from '../../lib/analytics/client-events';

describe('client analytics events', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts only sanitized event data to the analytics endpoint', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('navigator', { sendBeacon: vi.fn().mockReturnValue(false) });
    vi.stubGlobal('fetch', fetcher);

    trackClientEvent('sponsor_cta_click', {
      destination: 'google_play',
      source: 'album',
      accessToken: 'private-token',
      downloadUrl: 'https://r2.example.test/photo?X-Amz-Signature=private',
    });
    await Promise.resolve();

    expect(fetcher).toHaveBeenCalledWith('/api/v1/analytics', expect.objectContaining({ method: 'POST', keepalive: true }));
    const body = fetcher.mock.calls[0]?.[1]?.body as Blob;
    expect(await body.text()).toBe(JSON.stringify({ name: 'sponsor_cta_click', properties: { destination: 'google_play', source: 'album' } }));
  });
});
