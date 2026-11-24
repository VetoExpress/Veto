import { cpSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { basename, resolve, sep } from 'node:path'

const workspaceRoot = resolve(process.cwd())
const source = resolve(workspaceRoot, 'apps/frontend/.svelte-kit/cloudflare')
const target = resolve(workspaceRoot, 'apps/electron/out/renderer')
const electronOut = resolve(workspaceRoot, 'apps/electron/out')

if (!statSync(source, { throwIfNoEntry: false })?.isDirectory()) {
  throw new Error(`Frontend build not found: ${source}`)
}

if (!statSync(resolve(source, 'index.html'), { throwIfNoEntry: false })?.isFile()) {
  throw new Error(`Frontend SPA fallback not found: ${resolve(source, 'index.html')}`)
}

if (!target.startsWith(electronOut + sep)) {
  throw new Error(`Refusing to copy outside Electron output: ${target}`)
}

const workerOnlyFiles = new Set([
  '.assetsignore',
  '_headers',
  '_redirects',
  '_routes.json',
  '_worker.js',
  '_worker.js.map'
])

rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })
cpSync(source, target, {
  recursive: true,
  filter: (path) => !workerOnlyFiles.has(basename(path))
})

console.log(`Copied frontend build to ${target}`)
