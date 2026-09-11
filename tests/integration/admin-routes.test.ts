import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from '../../lib/errors/http-error';

const { assertTrustedMutation, clientRateLimitKey, enforceRateLimit, getAdminSummary, getSystemHealth, hideMoment, listAdminMoments, listAdminParticipants, requireAdmin, setEventMode, unhideMoment } = vi.hoisted(() => ({
  assertTrustedMutation: vi.fn(),
  clientRateLimitKey: vi.fn().mockReturnValue('operator-client'),
  enforceRateLimit: vi.fn(),
  getAdminSummary: vi.fn(),
  getSystemHealth: vi.fn(),
  hideMoment: vi.fn(),
  listAdminMoments: vi.fn(),
  listAdminParticipants: vi.fn(),
  requireAdmin: vi.fn(),
  setEventMode: vi.fn(),
  unhideMoment: vi.fn(),
}));

vi.mock('../../lib/auth/admin', () => ({ requireAdmin }));
vi.mock('../../lib/auth/csrf', () => ({ assertTrustedMutation }));
vi.mock('../../lib/auth/rate-limits', () => ({ clientRateLimitKey, enforceRateLimit }));
vi.mock('../../lib/db/repositories/admin', () => ({ getAdminSummary, hideMoment, listAdminMoments, listAdminParticipants, setEventMode, unhideMoment }));
vi.mock('../../lib/health/checks', () => ({ getSystemHealth }));

import { GET as summary } from '../../app/api/v1/admin/summary/route';
import { GET as moments } from '../../app/api/v1/admin/moments/route';
import { GET as participants } from '../../app/api/v1/admin/participants/route';
import { PATCH as visibility } from '../../app/api/v1/admin/moments/[momentId]/visibility/route';
import { GET as health } from '../../app/api/v1/admin/health/route';
import { PATCH as eventMode } from '../../app/api/v1/admin/event-mode/route';

const eventId = 'bd928dad-a8c6-40af-a482-30df35ad5e5b';
const momentId = '1ef1d9e5-2d09-4c1e-84dd-9e7c6bb0c219';
const admin = { id: '16a8a4d1-226a-4571-9898-4c907d9f10ab', email: 'operator@example.test' };

describe('admin operations routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_EVENT_ID', eventId);
    vi.stubEnv('NEXT_PUBLIC_EVENT_SLUG', 'invnity-moments-2026');
    requireAdmin.mockResolvedValue(admin);
    enforceRateLimit.mockResolvedValue(undefined);
    getAdminSummary.mockResolvedValue({ event: { id: eventId, slug: 'invnity-moments-2026', name: 'InVnity Moments', eventDate: '2026-10-10', status: 'live' }, metrics: { participants: 4, moments: 7, published: 6, hidden: 1 }, activity: [] });
    listAdminMoments.mockResolvedValue([]);
    listAdminParticipants.mockResolvedValue([]);
    getSystemHealth.mockResolvedValue({ checkedAt: '2026-09-11T00:00:00.000Z', overall: 'ok', checks: [] });
    setEventMode.mockResolvedValue({ id: eventId, slug: 'invnity-moments-2026', name: 'InVnity Moments', eventDate: '2026-10-10', status: 'maintenance' });
  });

  it('refuses a participant cookie when the admin guard rejects it', async () => {
    requireAdmin.mockRejectedValueOnce(new HttpError(401, 'ADMIN_UNAUTHENTICATED', 'Akses operator tidak tersedia.'));
    const response = await summary(new Request('https://moments.example.test/api/v1/admin/summary', { headers: { cookie: 'invnity_session=participant-session' } }));

    expect(response.status).toBe(401);
    expect(getAdminSummary).not.toHaveBeenCalled();
  });

  it('returns a safe dashboard summary for an authenticated operator', async () => {
    const response = await summary(new Request('https://moments.example.test/api/v1/admin/summary'));

    expect(response.status).toBe(200);
    expect(getAdminSummary).toHaveBeenCalledWith(eventId);
    expect(await response.json()).toMatchObject({ data: { metrics: { participants: 4, hidden: 1 } }, request_id: expect.any(String) });
  });

  it('lists recent or hidden moments without participant email', async () => {
    const momentResponse = await moments(new Request('https://moments.example.test/api/v1/admin/moments?visibility=hidden&limit=20'));

    expect(momentResponse.status).toBe(200);
    expect(listAdminMoments).toHaveBeenCalledWith({ eventId, visibility: 'hidden', limit: 20 });
    expect(listAdminParticipants).not.toHaveBeenCalled();
  });

  it('searches participants by name or batch without returning their email', async () => {
    const response = await participants(new Request('https://moments.example.test/api/v1/admin/participants?q=Andi&batch=1996&limit=20'));

    expect(response.status).toBe(200);
    expect(listAdminParticipants).toHaveBeenCalledWith({ eventId, query: 'Andi', batch: '1996', limit: 20 });
  });

  it('requires a moderation reason to hide, but restores without one', async () => {
    const hidden = await visibility(new Request(`https://moments.example.test/api/v1/admin/moments/${momentId}/visibility`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ visibility: 'hidden', reason: 'Privasi peserta.' }) }), { params: Promise.resolve({ momentId }) });
    const restored = await visibility(new Request(`https://moments.example.test/api/v1/admin/moments/${momentId}/visibility`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ visibility: 'published' }) }), { params: Promise.resolve({ momentId }) });

    expect(hidden.status).toBe(200);
    expect(restored.status).toBe(200);
    expect(hideMoment).toHaveBeenCalledWith(eventId, admin.id, momentId, 'Privasi peserta.');
    expect(unhideMoment).toHaveBeenCalledWith(eventId, admin.id, momentId);
    expect(assertTrustedMutation).toHaveBeenCalledTimes(2);
  });

  it('ignores a caller-supplied event id when moderating a photo', async () => {
    const response = await visibility(new Request(`https://moments.example.test/api/v1/admin/moments/${momentId}/visibility?eventId=another-event`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ visibility: 'hidden', reason: 'Privasi peserta.', eventId: 'another-event' }),
    }), { params: Promise.resolve({ momentId }) });
    expect(response.status).toBe(200);
    expect(hideMoment).toHaveBeenCalledWith(eventId, admin.id, momentId, 'Privasi peserta.');
  });

  it('refuses moderation when the configured event is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_EVENT_ID', '');
    const response = await visibility(new Request(`https://moments.example.test/api/v1/admin/moments/${momentId}/visibility`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ visibility: 'published' }),
    }), { params: Promise.resolve({ momentId }) });
    expect(response.ok).toBe(false);
    expect(unhideMoment).not.toHaveBeenCalled();
  });

  it('returns safe health checks and changes the selected event mode', async () => {
    const healthResponse = await health(new Request('https://moments.example.test/api/v1/admin/health'));
    const modeResponse = await eventMode(new Request('https://moments.example.test/api/v1/admin/event-mode', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'maintenance' }) }));

    expect(healthResponse.status).toBe(200);
    expect(getSystemHealth).toHaveBeenCalledWith(eventId);
    expect(modeResponse.status).toBe(200);
    expect(setEventMode).toHaveBeenCalledWith(eventId, 'maintenance');
  });
});
