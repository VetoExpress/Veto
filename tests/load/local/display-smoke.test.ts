import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { startDisplayWs, stopDisplayWs } from '../../../apps/electron/src/main/display-ws'

vi.mock('../../../apps/electron/src/main/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const k6 = join(root, 'tests/load/.tools', process.platform === 'win32' ? 'k6.exe' : 'k6')
let output: string | undefined
afterEach(async () => {
  await stopDisplayWs()
  if (output) {
    const checked = resolve(output)
    if (
      !checked.startsWith(resolve(tmpdir()) + (process.platform === 'win32' ? '\\' : '/')) ||
      !checked.includes('veto-load-display-')
    )
      throw new Error('Unexpected temporary directory')
    await rm(checked, { recursive: true, force: true })
  }
})

describe.skipIf(!existsSync(k6))('k6 against the actual Chair-to-Display transport', () => {
  it('forwards only the matching committee projection and writes a passing report', async () => {
    const port = await startDisplayWs()
    output = await mkdtemp(join(tmpdir(), 'veto-load-display-'))
    const exit = await new Promise<number | null>((done, reject) => {
      const child = spawn(
        process.execPath,
        [
          'tests/load/run.mjs',
          '--scenario',
          'display',
          '--profile',
          'smoke',
          '--target',
          `http://127.0.0.1:${port}/v1`,
          '--display-ws-url',
          `ws://127.0.0.1:${port}/`,
          '--vus',
          '2',
          '--duration',
          '1',
          '--ramp',
          '0',
          '--action-interval',
          '0.1',
          '--results',
          output!,
          '--k6',
          k6
        ],
        { cwd: root, stdio: 'ignore', windowsHide: true }
      )
      child.once('error', reject)
      child.once('close', done)
    })
    const [run] = await readdir(output)
    const metadata = JSON.parse(await readFile(join(output, run, 'metadata.json'), 'utf8'))
    const summary = JSON.parse(await readFile(join(output, run, 'summary.json'), 'utf8'))
    expect(metadata.exitCode).toBe(0)
    expect(exit).toBe(0)
    expect(summary.metrics.display_projection_ok.values.rate).toBe(1)
    expect(summary.metrics.iterations.thresholds['count==2'].ok).toBe(true)
    expect(summary.metrics.content_visible_ms.values['p(95)']).toBeGreaterThanOrEqual(0)
  }, 30_000)
})
