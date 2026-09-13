import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from '../../lib/errors/http-error';

const { clientRateLimitKey, enforceRateLimit, getFunnelSummary, getSponsorSummary, requireAdmin, trackServerEvent } = vi.hoisted(() => ({
  clientRateLimitKey: vi.fn().mockReturnValue('safe-client'),
  enforceRateLimit: vi.fn(),
  getFunnelSummary: vi.fn(),
  getSponsorSummary: vi.fn(),
  requireAdmin: vi.fn(),
  trackServerEvent: vi.fn(),
}));
const getAdminSummary = vi.hoisted(() => vi.fn());

vi.mock('../../lib/auth/admin', () => ({ requireAdmin }));
vi.mock('../../lib/auth/rate-limits', () => ({ clientRateLimitKey, enforceRateLimit }));
vi.mock('../../lib/analytics/server-events', () => ({ trackServerEvent }));
vi.mock('../../lib/analytics/aggregates', () => ({ getFunnelSummary, getSponsorSummary }));
vi.mock('../../lib/db/repositories/admin', () => ({ getAdminSummary }));

import { POST as record } from '../../app/api/v1/analytics/route';
import { GET as summary } from '../../app/api/v1/admin/analytics/route';
import { GET as adminSummary } from '../../app/api/v1/admin/summary/route';

const eventId = '6f5f1934-e154-4d29-b53f-b9b629fd24cd';

describe('analytics routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_EVENT_ID', eventId);
    vi.stubEnv('NEXT_PUBLIC_EVENT_SLUG', 'invnity-moments-2026');
    enforceRateLimit.mockResolvedValue(undefined);
    requireAdmin.mockResolvedValue({ id: 'admin-1', email: 'admin@example.test' });
    trackServerEvent.mockResolvedValue(undefined);
    getFunnelSummary.mockResolvedValue({ qrLanding: 1, registrationStarted: 1, registrationCompleted: 1, cameraOpened: 1, captures: 1, uploadStarted: 1, uploadSucceeded: 1, published: 1, galleryViews: 1, momentDetailViews: 0, likes: 0, downloads: 0, recoveryRequested: 0, recoveryCompleted: 0 });
    getSponsorSummary.mockResolvedValue({ views: 4, clicks: 1, ctr: 25 });
    getAdminSummary.mockResolvedValue({ participants: 1, moments: 2, published: 2, hidden: 0, activity: [] });
  });

  it('records a sanitized public event against only the configured event', async () => {
    const response = await record(new Request('https://moments.example.test/api/v1/analytics', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-request-id': '7b7dc98e-77ff-4f00-a63f-d8257e927a5d' },
      body: JSON.stringify({ name: 'sponsor_cta_click', properties: { destination: 'google_play', email: 'private@example.test' }, eventId: 'other-event' }),
    }));

    expect(response.status).toBe(202);
    expect(trackServerEvent).toHaveBeenCalledWith({ eventId, participantId: null, name: 'sponsor_cta_click', properties: { destination: 'google_play' } });
    expect(response.headers.get('x-request-id')).toBe('7b7dc98e-77ff-4f00-a63f-d8257e927a5d');
  });

  it('rejects invalid public event telemetry before persistence', async () => {
    const response = await record(new Request('https://moments.example.test/api/v1/analytics', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'email_exported' }) }));
    expect(response.status).toBe(400);
    expect(trackServerEvent).not.toHaveBeenCalled();
  });

  it('rejects non-JSON analytics requests before parsing or persistence', async () => {
    const response = await record(new Request('https://moments.example.test/api/v1/analytics', {
      method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ name: 'qr_landing' }),
    }));

    expect(response.status).toBe(415);
    expect(await response.json()).toMatchObject({ error: { code: 'ANALYTICS_CONTENT_TYPE_INVALID' } });
    expect(trackServerEvent).not.toHaveBeenCalled();
  });

  it('rejects analytics bodies over the limit before JSON parsing', async () => {
    const response = await record(new Request('https://moments.example.test/api/v1/analytics', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': '8193' },
      body: JSON.stringify({ name: 'qr_landing' }),
    }));

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: 'ANALYTICS_BODY_TOO_LARGE' } });
    expect(trackServerEvent).not.toHaveBeenCalled();
  });

  it('requires an admin session for the aggregate metrics and never claims installs', async () => {
    const response = await summary(new Request('https://moments.example.test/api/v1/admin/analytics'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { sponsor: { views: 4, clicks: 1, ctr: 25 } } });
    expect(getFunnelSummary).toHaveBeenCalledWith(eventId);
    expect(getSponsorSummary).toHaveBeenCalledWith(eventId);

    requireAdmin.mockRejectedValueOnce(new HttpError(401, 'ADMIN_UNAUTHENTICATED', 'Akses operator tidak tersedia.'));
    const denied = await summary(new Request('https://moments.example.test/api/v1/admin/analytics'));
    expect(denied.status).toBe(401);
  });

  it('preserves the middleware request id in legacy admin success and error responses', async () => {
    const id = '7b7dc98e-77ff-4f00-a63f-d8257e927a5d';
    const request = new Request('https://moments.example.test/api/v1/admin/summary', { headers: { 'x-request-id': id } });

    const success = await adminSummary(request);
    expect((await success.json()).request_id).toBe(id);
    expect(success.headers.get('x-request-id')).toBe(id);

    requireAdmin.mockRejectedValueOnce(new HttpError(401, 'ADMIN_UNAUTHENTICATED', 'Akses operator tidak tersedia.'));
    const denied = await adminSummary(request);
    expect((await denied.json()).request_id).toBe(id);
    expect(denied.headers.get('x-request-id')).toBe(id);
  });
});
