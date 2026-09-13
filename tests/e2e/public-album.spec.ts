import { expect, test } from '@playwright/test';

const moment = { id: '1ef1d9e5-2d09-4c1e-84dd-9e7c6bb0c219', category: 'REUNI', likeCount: 4, createdAt: '2026-09-10T00:00:00.000Z', publishedAt: '2026-09-10T00:00:00.000Z', thumbnailUrl: 'https://images.test/thumb.jpg', displayUrl: 'https://images.test/display.jpg' };

test('visitor can filter the public album, open a moment, like, and request a signed download', async ({ page }) => {
  let listCalls = 0;
  await page.route('**/api/v1/moments**', async (route) => {
    listCalls += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { data: [moment], nextCursor: null }, request_id: 'list' }) });
  });
  await page.route(`**/api/v1/moments/${moment.id}`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { moment }, request_id: 'detail' }) });
  });
  await page.route(`**/api/v1/moments/${moment.id}/like`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { liked: true, likeCount: 5 }, request_id: 'like' }) });
  });
  await page.route(`**/api/v1/moments/${moment.id}/download`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { downloadUrl: 'https://downloads.test/signed.jpg' }, request_id: 'download' }) });
  });

  await page.goto('/album');
  await expect(page.getByRole('heading', { name: /Ribuan cerita/i })).toBeVisible();
  await expect(page.getByRole('img', { name: /Momen Reuni/i })).toBeVisible();
  await page.getByRole('tab', { name: /Reuni/i }).click();
  await expect.poll(() => listCalls).toBeGreaterThan(1);
  await expect(page.getByRole('link', { name: /Momen Reuni/i })).toHaveAttribute('href', `/album/${moment.id}`);
  await page.goto(`/album/${moment.id}`);
  await expect(page.getByRole('heading', { name: 'Momen kita.' })).toBeVisible();
  await page.getByRole('button', { name: /4 suka/i }).click();
  await expect(page.getByRole('button', { name: /5 suka/i })).toBeVisible();
  await page.getByRole('button', { name: /Download foto/i }).click();
});
