import tailwindcss from '@tailwindcss/vite'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'
import pkg from './package.json' with { type: 'json' }

const now = new Date()
const pad = (n: number) => String(n).padStart(2, '0')
const buildTime = `${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`
const devServerUrl = new URL(process.env.ELECTRON_RENDERER_URL ?? 'http://127.0.0.1:5173')
const defaultDevPort = devServerUrl.protocol === 'https:' ? 443 : 80

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_BUILD_TIME__: JSON.stringify(buildTime)
  },
  plugins: [tailwindcss(), sveltekit()].filter(Boolean),
  server: {
    host: devServerUrl.hostname,
    port: Number(devServerUrl.port || defaultDevPort),
    strictPort: true
  }
})
