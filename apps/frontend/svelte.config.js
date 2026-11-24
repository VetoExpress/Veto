import adapter from '@sveltejs/adapter-cloudflare'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    files: {
      assets: 'src/static'
    },
    csrf: {
      checkOrigin: false
    },
    alias: {
      $lib: 'src/lib',
      $units: 'src/lib/assets/battle/base-mod'
    }
  }
}

export default config
