import { describe, expect, it } from 'vitest'
import { aggregate, distribution, Gate, parseTiming } from './metrics.mjs'

describe('large load diagnostics', () => {
  it('keeps failures separate from successful latency and does not invent missing server timing', () => {
    const base = { phase: 'online', operation: 'files', queueMs: 5, bodyMs: 2 }
    const groups = aggregate([
      {
        ...base,
        ok: true,
        status: 200,
        code: '',
        totalMs: 110,
        ttfbMs: 100,
        server: { worker: 80, db_token_first: 30 }
      },
      {
        ...base,
        ok: false,
        status: 0,
        code: 'TimeoutError',
        totalMs: 30000,
        ttfbMs: null,
        server: {}
      }
    ])
    expect(groups['online/files'].successfulTotal.p95).toBe(110)
    expect(groups['online/files'].failedTotal.p95).toBe(30000)
    expect(groups['online/files'].server.worker.n).toBe(1)
    expect(groups['online/files'].outsideWorker.p95).toBe(20)
    expect(groups['online/files'].errors).toEqual({ '0:TimeoutError': 1 })
    expect(distribution([]).p95).toBeNull()
  })
  it('parses timing stages without interpreting call counts as durations', () => {
    expect(parseTiming('worker;dur=20, db_token_first;dur=12.5;desc="1 calls"')).toEqual({
      worker: 20,
      db_token_first: 12.5
    })
  })
  it('hands a concurrency slot directly to a queued caller', async () => {
    const gate = new Gate(1)
    const release = await gate.enter()
    let entered = false
    const waiting = gate.enter().then((done) => {
      entered = true
      return done
    })
    await Promise.resolve()
    expect(entered).toBe(false)
    release()
    const done = await waiting
    expect(gate.active).toBe(1)
    done()
    expect(gate.active).toBe(0)
  })
  it('removes expired queued requests without consuming a connection slot', async () => {
    const gate = new Gate(1)
    const release = await gate.enter()
    const controller = new AbortController()
    const waiting = gate.enter(controller.signal)
    controller.abort()
    await expect(waiting).rejects.toThrow()
    expect(gate.waiting.length).toBe(0)
    release()
    expect(gate.active).toBe(0)
  })
})
