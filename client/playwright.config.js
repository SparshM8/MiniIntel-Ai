import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  workers: process.env.CI ? 1 : undefined,
  use: { baseURL: 'http://127.0.0.1:4179', browserName: 'chromium', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4179 --strictPort',
    url: 'http://127.0.0.1:4179', reuseExistingServer: false,
    env: { VITE_API_URL: '/api/v1' }
  }
});
