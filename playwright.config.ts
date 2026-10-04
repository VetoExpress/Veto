import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL, trace: 'retain-on-failure' },
  webServer: [
    { command: 'pnpm --dir apps/platform dev --port 4174', url: 'http://localhost:4174/login', env: { NEXT_PUBLIC_API_URL: 'http://localhost:4174', VETO_E2E: '1' }, reuseExistingServer: false, timeout: 120_000 },
    { command: 'pnpm --filter @vetoexpress/frontend build && pnpm --filter @vetoexpress/frontend preview --host localhost --port 4173 --strictPort', url: 'http://localhost:4173/conference', env: { VITE_CLOUD_API_URL: 'http://localhost:4173/v1' }, reuseExistingServer: false, timeout: 180_000 },
  ],
})
