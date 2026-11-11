export function distribution(values) {
  if (!values.length) return { n: 0, p50: null, p95: null, p99: null, max: null }
  const sorted = [...values].sort((a, b) => a - b)
  const at = (p) => Math.round(sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] * 100) / 100
  return { n: sorted.length, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: at(1) }
}

export function parseTiming(header = '') {
  return Object.fromEntries(
    String(header)
      .split(',')
      .flatMap((part) => {
        const match = part.trim().match(/^([a-z0-9_]+);dur=([\d.]+)/)
        return match ? [[match[1], Number(match[2])]] : []
      })
  )
}

export class Gate {
  active = 0
  waiting = []
  constructor(limit) {
    this.limit = limit
  }
  async enter(signal) {
    signal?.throwIfAborted()
    if (this.active >= this.limit)
      await new Promise((resolve, reject) => {
        const ready = () => {
          signal?.removeEventListener('abort', abort)
          resolve()
        }
        const abort = () => {
          const index = this.waiting.indexOf(ready)
          if (index >= 0) this.waiting.splice(index, 1)
          reject(signal.reason)
        }
        this.waiting.push(ready)
        signal?.addEventListener('abort', abort, { once: true })
      })
    else this.active++
    return () => {
      const next = this.waiting.shift()
      if (next) next()
      else this.active--
    }
  }
}

export function aggregate(samples) {
  const groups = Map.groupBy(samples, (sample) => `${sample.phase}/${sample.operation}`)
  return Object.fromEntries(
    [...groups].map(([key, rows]) => {
      const ok = rows.filter((row) => row.ok)
      const timed = rows.filter((row) => Number.isFinite(row.server?.worker))
      const names = [...new Set(timed.flatMap((row) => Object.keys(row.server)))]
      return [
        key,
        {
          attempts: rows.length,
          succeeded: ok.length,
          failed: rows.length - ok.length,
          errors: Object.fromEntries(
            [
              ...Map.groupBy(
                rows.filter((row) => !row.ok),
                (row) => `${row.status}:${row.code}`
              )
            ].map(([name, items]) => [name, items.length])
          ),
          total: distribution(rows.map((row) => row.totalMs)),
          successfulTotal: distribution(ok.map((row) => row.totalMs)),
          failedTotal: distribution(rows.filter((row) => !row.ok).map((row) => row.totalMs)),
          queue: distribution(rows.map((row) => row.queueMs)),
          ttfb: distribution(rows.filter((row) => row.ttfbMs !== null).map((row) => row.ttfbMs)),
          body: distribution(rows.filter((row) => row.bodyMs !== null).map((row) => row.bodyMs)),
          outsideWorker: distribution(
            timed.map((row) => Math.max(0, row.ttfbMs - row.server.worker))
          ),
          server: Object.fromEntries(
            names.map((name) => [
              name,
              distribution(
                timed
                  .filter((row) => Number.isFinite(row.server[name]))
                  .map((row) => row.server[name])
              )
            ])
          )
        }
      ]
    })
  )
}
