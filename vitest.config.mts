import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  test: { exclude: ['**/node_modules/**', '**/tests/e2e/**', '**/.worktrees/**'] },
  plugins: [svelte()],
  resolve: {
    alias: {
      '$lib': resolve(import.meta.dirname, 'apps/frontend/src/lib')
    }
  }
})
