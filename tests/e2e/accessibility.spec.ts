import { expect, test } from '@playwright/test';

const viewports = [320, 375, 390, 412, 1280];

for (const width of viewports) {
  test(`landing page is usable at ${width}px without horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');

    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const start = page.getByRole('link', { name: /Mulai abadikan momen/i });
    await start.focus();
    await expect(start).toBeFocused();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('primary landing action is keyboard operable', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Mulai abadikan momen/i }).press('Enter');
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByLabel('Nama lengkap')).toBeVisible();
});
