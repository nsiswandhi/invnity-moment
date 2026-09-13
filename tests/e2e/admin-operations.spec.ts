import { expect, test } from '@playwright/test';

const event = { id: 'bd928dad-a8c6-40af-a482-30df35ad5e5b', slug: 'invnity-moments-2026', name: 'InVnity Moments', eventDate: '2026-10-10', status: 'live' };
const summary = { event, metrics: { participants: 427, moments: 3812, published: 3790, hidden: 22 }, activity: [{ id: 'activity-1', at: '2026-10-10T12:00:00.000Z', label: 'Momen REUNI — upload', kind: 'upload' }] };
const moment = { id: '1ef1d9e5-2d09-4c1e-84dd-9e7c6bb0c219', category: 'REUNI', status: 'PUBLISHED', createdAt: '2026-10-10T12:00:00.000Z', publishedAt: '2026-10-10T12:00:00.000Z', hiddenAt: null, hiddenReason: null, participantName: 'Andi', participantBatch: '1996' };

test('operator can view operations, set maintenance, moderate a moment, and search participants', async ({ page }) => {
  let mode = 'live';
  await page.route('**/api/v1/admin/summary**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ...summary, event: { ...summary.event, status: mode } }, request_id: 'summary' }) }));
  await page.route('**/api/v1/admin/health**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { checkedAt: '2026-10-10T12:00:00.000Z', overall: 'ok', checks: [{ component: 'database', status: 'ok', label: 'Database', latencyMs: 10, timeoutMs: 2000 }] }, request_id: 'health' }) }));
  await page.route('**/api/v1/admin/event-mode', async (route) => { mode = JSON.parse(route.request().postData() || '{}').mode || mode; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { event: { ...event, status: mode } }, request_id: 'mode' }) }); });
  await page.route('**/api/v1/admin/moments?**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [moment], request_id: 'moments' }) }));
  await page.route(`**/api/v1/admin/moments/${moment.id}/visibility`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { momentId: moment.id, visibility: 'hidden' }, request_id: 'visibility' }) }));
  await page.route('**/api/v1/admin/participants?**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'participant-1', name: 'Andi', batch: '1996', momentCount: 8, registeredAt: '2026-10-10T10:00:00.000Z' }], request_id: 'participants' }) }));

  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: /Operasi acara/i })).toBeVisible();
  await expect(page.getByText('427')).toBeVisible();
  await page.getByRole('button', { name: /Aktifkan maintenance/i }).click();
  await expect(page.getByText(/Mode maintenance aktif/i)).toBeVisible();

  await page.getByRole('link', { name: /Moderasi/i }).click();
  await expect(page.getByRole('heading', { name: /Moderasi momen/i })).toBeVisible();
  await page.getByLabel(/Alasan sembunyikan foto Andi/i).fill('Privasi peserta.');
  await page.getByRole('button', { name: /Sembunyikan foto Andi/i }).click();
  await expect(page.getByText(/Foto disembunyikan/i)).toBeVisible();

  await page.goto('/admin/participants');
  await page.getByRole('searchbox', { name: /Cari peserta/i }).fill('Andi');
  await page.getByRole('button', { name: /Cari peserta/i }).click();
  await expect(page.getByText('Andi')).toBeVisible();
  await expect(page.getByText('1996')).toBeVisible();
});
