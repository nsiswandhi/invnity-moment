import { describe, expect, it, vi } from 'vitest';
import { createAnalyticsRepository } from '../../lib/analytics/aggregates';

const eventId = '6f5f1934-e154-4d29-b53f-b9b629fd24cd';

describe('analytics aggregates', () => {
  it('uses event-scoped RPCs for funnel and sponsor totals', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ qrLanding: 18, registrationStarted: 10, registrationCompleted: 8, cameraOpened: 6, captures: 6, uploadStarted: 6, uploadSucceeded: 5, published: 5, galleryViews: 12, momentDetailViews: 4, likes: 3, downloads: 2, recoveryRequested: 1, recoveryCompleted: 1 })
      .mockResolvedValueOnce({ views: 12, clicks: 3, ctr: 25 });
    const repository = createAnalyticsRepository({ rpc });

    await expect(repository.getFunnelSummary(eventId)).resolves.toMatchObject({ registrationCompleted: 8, downloads: 2 });
    await expect(repository.getSponsorSummary(eventId)).resolves.toEqual({ views: 12, clicks: 3, ctr: 25 });
    expect(rpc).toHaveBeenNthCalledWith(1, 'get_analytics_funnel_summary', { p_event_id: eventId });
    expect(rpc).toHaveBeenNthCalledWith(2, 'get_sponsor_summary', { p_event_id: eventId });
  });
});
