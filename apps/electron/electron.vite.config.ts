import { defineConfig } from 'electron-vite'

const usageEndpoint = process.env.VETO_USAGE_ENDPOINT ?? 'https://api.miaoyww.top/v1/event'
const usageIngestKey = process.env.VETO_USAGE_INGEST_KEY ?? '34da52216c7243248407dc283eddf0a5'

export default defineConfig({
  main: {
    build: { externalizeDeps: { exclude: ['@vetoexpress/auth'] } },
    define: {
      __VETO_ACCOUNT_API_URL__: JSON.stringify(
        process.env.VETO_ACCOUNT_API_URL ?? 'https://api.miaoyww.top'
      ),
      __VETO_USAGE_ENDPOINT__: JSON.stringify(usageEndpoint),
      __VETO_USAGE_INGEST_KEY__: JSON.stringify(usageIngestKey)
    }
  },
  preload: {}
})
