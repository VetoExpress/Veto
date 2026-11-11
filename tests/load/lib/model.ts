import type { Content, SeatCredential, Topic } from './types.ts'

export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

export function credentialFor(seats: readonly SeatCredential[], id: number): SeatCredential {
  const credential = seats[id - 1]
  if (!credential) throw new Error('INSUFFICIENT_CREDENTIALS')
  return credential
}

export function reconnectDelay(failures: number, jitter = Math.random()): number {
  return Math.min(60_000, 1000 * 2 ** Math.min(failures, 6)) + jitter * 1000
}

export function marker(runId: string, vu: number, sequence: number, started = Date.now()): string {
  return `veto-load:${runId}:${vu}:${sequence}:${started}`
}

export function markerTime(item: Content, runId: string): number | null {
  const text = `${item.title ?? ''} ${item.content ?? ''}`
  const prefix = `veto-load:${runId}:`
  const start = text.indexOf(prefix)
  if (start < 0) return null
  const parts = text.slice(start + prefix.length).match(/^(\d+):(\d+):(\d+)(?:\D|$)/)
  if (!parts) return null
  const time = Number(parts[3])
  return Number.isSafeInteger(time) && time > 0 ? time : null
}

export function verificationFileType(
  prefix: string,
  runHash: string,
  vu: number,
  sequence: number
): string {
  return `${Array.from(prefix).slice(0, 12).join('')}:${runHash.slice(0, 16)}:${vu}:${Math.floor(sequence / 100)}`
}

/** Keep the first actual read time rather than the time a later integrity probe happens to run. */
export class ObservationTimes {
  private entries = new Map<string, number>()
  constructor(private readonly capacity = 6000) {}

  remember(id: string, status: string | undefined, time: number): void {
    for (const key of [id, `${id}:${status}`]) {
      if (!this.entries.has(key)) this.entries.set(key, time)
    }
    while (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value!)
  }

  get(id: string, status?: string): number | undefined {
    return this.entries.get(status ? `${id}:${status}` : id)
  }
}

/** One subscription serializes reads and preserves invalidations received during a read. */
export class RefreshQueue {
  private dirty = new Set<Topic>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private running = false
  private active = true
  private visible = true
  private current: Promise<void> = Promise.resolve()

  constructor(
    private readonly refresh: (topics: Topic[]) => Promise<void>,
    private readonly onError: (error: unknown) => void,
    private readonly mergeMs = 250
  ) {}

  invalidate(topics: Topic[]): void {
    for (const topic of topics) this.dirty.add(topic)
    this.schedule()
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    if (visible) this.schedule()
  }

  private schedule(): void {
    if (!this.active || !this.visible || this.running || this.timer || !this.dirty.size) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      if (!this.active || !this.visible) return
      const topics = [...this.dirty]
      this.dirty.clear()
      this.running = true
      this.current = this.refresh(topics)
        .catch(this.onError)
        .finally(() => {
          this.running = false
          this.schedule()
        })
    }, this.mergeMs)
  }

  async close(): Promise<void> {
    this.active = false
    clearTimeout(this.timer)
    await this.current
  }
}
