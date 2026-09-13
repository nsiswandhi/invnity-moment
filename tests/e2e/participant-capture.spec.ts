import { test, expect } from '@playwright/test';

test('participant can register, capture, categorize, and see a saved moment', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => new MediaStream() } });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 640 });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 480 });
    HTMLVideoElement.prototype.play = async () => undefined;
  });
  await page.route('**/api/v1/events/invnity-moments-2026/participants', async (route) => route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { participant: { id: 'participant-1', eventId: 'event-1', name: 'Sari Wijaya', batch: 'IA 5' } } }) }));
  await page.goto('/');
  await page.getByRole('link', { name: /Mulai abadikan momen/i }).click();
  await page.getByLabel('Nama lengkap').fill('Sari Wijaya'); await page.getByLabel('Angkatan / batch').fill('IA 5'); await page.getByLabel('Email untuk akses kembali').fill('sari@example.test');
  await page.getByRole('button', { name: /Lanjutkan ke momen/i }).click();
  await page.route('**/api/v1/me', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { participant: { id: 'participant-1', eventId: 'event-1', name: 'Sari Wijaya', batch: 'IA 5' }, quota: { activeMoments: 0, maxActiveMoments: 10 } } }) }));
  await page.route('**/api/v1/me/moments**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { data: [], nextCursor: null } }) }));
  await page.goto('/moments'); await expect(page.getByRole('heading', { name: /Hai, Sari/i })).toBeVisible();
  await page.getByRole('button', { name: /Ambil momen/i }).click(); await page.getByRole('button', { name: /Aktifkan kamera/i }).click();
  const shutter = page.getByRole('button', { name: /Ambil foto/i });
  await expect(shutter).toBeEnabled(); await shutter.click();
  await expect(page.getByRole('heading', { name: /Bagus! Mau simpan/i })).toBeVisible(); await page.getByRole('button', { name: /Simpan foto/i }).click();
  await page.getByRole('button', { name: 'Pilih kategori Reuni' }).click(); await expect(page.getByRole('button', { name: /Simpan ke album/i })).toBeEnabled();
  await page.route('**/api/v1/moments/reserve', async (route) => route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { momentId: 'moment-1', uploadUrl: '/__e2e-upload/moment-1', headers: { 'content-type': 'image/jpeg' } } }) }));
  await page.route('**/__e2e-upload/**', async (route) => route.fulfill({ status: 200, body: '' }));
  await page.route('**/api/v1/moments/moment-1/complete', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { moment: { id: 'moment-1', participantId: 'participant-1', eventId: 'event-1', status: 'PUBLISHED', category: 'REUNI', r2OriginalKey: 'original', r2DisplayKey: null, r2ThumbnailKey: null, mimeType: 'image/jpeg', byteSize: 100, width: 640, height: 480, createdAt: '2026-09-10T00:00:00.000Z', publishedAt: '2026-09-10T00:00:00.000Z', deletedAt: null } } }) }));
  await page.getByRole('button', { name: /Simpan ke album/i }).click(); await expect(page.getByRole('heading', { name: /Momenmu sudah tersimpan/i })).toBeVisible();
  await page.getByRole('button', { name: /Lihat momen saya/i }).click(); await expect(page.getByLabel('Ubah kategori Reuni')).toBeVisible();
});
