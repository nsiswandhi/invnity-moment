import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
  },
  webServer: {
    command: 'npx next start',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
  },
});
