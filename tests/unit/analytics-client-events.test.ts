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

  it('emits a keyed view event only once while allowing distinct views', async () => {
    const analytics = await import('../../lib/analytics/client-events') as typeof import('../../lib/analytics/client-events') & {
      trackClientEventOnce?: (key: string, name: 'qr_landing' | 'gallery_view' | 'moment_detail_view', properties?: Record<string, unknown>) => void;
    };
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('navigator', { sendBeacon: vi.fn().mockReturnValue(false) });
    vi.stubGlobal('fetch', fetcher);

    expect(analytics.trackClientEventOnce).toEqual(expect.any(Function));
    analytics.trackClientEventOnce?.('landing', 'qr_landing');
    analytics.trackClientEventOnce?.('landing', 'qr_landing');
    analytics.trackClientEventOnce?.('album', 'gallery_view', { source: 'public' });
    await Promise.resolve();

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('allows a keyed event to retry after its transport fails', async () => {
    const analytics = await import('../../lib/analytics/client-events');
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    vi.stubGlobal('navigator', { sendBeacon: vi.fn().mockReturnValue(false) });
    vi.stubGlobal('fetch', fetcher);

    await analytics.trackClientEventOnce('retryable-view', 'gallery_view', { source: 'public' });
    await analytics.trackClientEventOnce('retryable-view', 'gallery_view', { source: 'public' });

    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
