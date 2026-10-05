import { defineConfig } from '@playwright/test'
export default defineConfig({ testDir: './tests/e2e', workers: 1, timeout: 60000, expect: { timeout: 10000 }, reporter: 'list', use: { headless: true, channel: "msedge" }, webServer: { command: 'pnpm --dir apps/platform dev --port 4174', url: 'http://localhost:4174/login', env: { NEXT_PUBLIC_API_URL: 'http://localhost:4174', VETO_E2E: '1' }, reuseExistingServer: true, timeout: 120000 } })

