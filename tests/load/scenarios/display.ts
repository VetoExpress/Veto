import { LoadWebSocket } from '../lib/websocket.ts'
import { delay } from '../lib/model.ts'
import * as metrics from '../lib/metrics.ts'
import type { LoadConfig } from '../lib/types.ts'

/** Requires a running Chair transport. Does not launch or measure Electron rendering. */
export async function runDisplay(config: LoadConfig, runId: string, vu: number): Promise<void> {
  const committee = `veto-load-${runId}-${vu}`
  const separator = config.displayWsUrl!.includes('?') ? '&' : '?'
  const base = config.displayWsUrl!
  const display = new LoadWebSocket(`${base}${separator}role=display&committeeId=${committee}`)
  const chair = new LoadWebSocket(`${base}${separator}role=chair&committeeId=${committee}`)
  let delivered = 0
  let sequence = 0
  const pending = new Map<number, number>()
  display.addEventListener('message', (event) => {
    let message: { committeeId?: string; data?: { runId?: string; sequence?: number } }
    try {
      message = JSON.parse(String(event.data))
    } catch {
      metrics.recordError('display.receive', 'invalid_json')
      return
    }
    if (message.committeeId !== committee) {
      metrics.displayOK.add(false)
      metrics.recordError('display.receive', 'wrong_committee')
      return
    }
    if (message.data?.runId !== runId) return
    const start = pending.get(message.data.sequence!)
    if (start !== undefined) {
      delivered++
      pending.delete(message.data.sequence!)
      metrics.visibleMs.add(Date.now() - start)
      metrics.displayOK.add(true)
    }
  })
  const deadline = Date.now() + config.readyTimeoutSeconds * 1000
  try {
    while ((chair.readyState !== 1 || display.readyState !== 1) && Date.now() < deadline)
      await delay(25)
    if (chair.readyState !== 1 || display.readyState !== 1)
      throw new Error('DISPLAY_CONNECT_TIMEOUT')
    const until = Date.now() + config.durationSeconds * 1000
    while (Date.now() < until) {
      pending.set(sequence, Date.now())
      chair.send(
        JSON.stringify({
          type: 'display_data',
          committeeId: committee,
          data: { runId, sequence: sequence++ }
        })
      )
      await delay(config.actionIntervalSeconds * 1000)
    }
    await delay(250)
    for (const _entry of pending) metrics.displayOK.add(false)
    if (!delivered || pending.size) metrics.recordError('display.receive', 'missing_projection')
  } catch {
    metrics.displayOK.add(false)
    metrics.recordError('display.transport', 'failed')
  } finally {
    chair.close()
    display.close()
  }
}
