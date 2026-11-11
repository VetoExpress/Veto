import { LoadWebSocket, type LoadSocket } from './websocket.ts'
import { CloudApi } from './cloud-api.ts'
import { NotificationFeed } from './notification-feed.ts'
import { ObservationTimes, RefreshQueue, delay, markerTime, reconnectDelay } from './model.ts'
import * as metrics from './metrics.ts'
import type { Authentication, Content, LoadConfig, SeatCredential, Topic } from './types.ts'

const topics: Topic[] = ['files', 'notifications', 'news', 'directives', 'situations', 'timeline']
export class SeatSession {
  readonly api: CloudApi
  auth!: Authentication
  private socket: LoadSocket | undefined
  private stopped = false
  private expired = false
  private ready = false
  private received = 0
  private failures = 0
  private lastPong = Date.now()
  private lastReconciled = Date.now()
  private reconnectStarted = 0
  private retry: ReturnType<typeof setTimeout> | undefined
  private heartbeat: ReturnType<typeof setInterval> | undefined
  private feed: NotificationFeed
  private observed = new Set<string>()
  private firstSeen = new ObservationTimes()
  private queue: RefreshQueue

  constructor(
    readonly config: LoadConfig,
    readonly runId: string,
    private readonly connectionChanged: (online: boolean) => void = () => {}
  ) {
    this.api = new CloudApi(config)
    this.feed = new NotificationFeed(
      (cursor) =>
        this.api.json('GET', `/veto/files/notifications?after=${cursor}`, 'notifications.list'),
      () => this.active
    )
    this.queue = new RefreshQueue(
      (changed) => this.refresh(changed),
      () => metrics.recordError('live.refresh', 'refresh_failed')
    )
  }

  can(capability: string): boolean {
    return this.auth.identity.capabilities.includes(capability)
  }
  get active(): boolean {
    return !this.stopped && !this.expired
  }

  async start(credential: SeatCredential): Promise<void> {
    try {
      this.auth = await this.api.authenticate(credential)
      metrics.authOK.add(true)
    } catch (error) {
      metrics.authOK.add(false)
      throw error
    }
    // Only the authenticated server chooses the path; explicit host allowlist prevents credential forwarding.
    const match = this.auth.wsUrl.match(/^(wss?):\/\/([^/?#]+)(\/[^#]*)?$/)
    const allowed = new Set([this.config.target.split('/')[2], ...this.config.wsAllowedHosts])
    if (
      !match ||
      !allowed.has(match[2]) ||
      match[2].includes('@') ||
      (this.config.environment === 'cloudflare' && match[1] !== 'wss') ||
      /[?&](token|key|password)=/i.test(this.auth.wsUrl)
    ) {
      metrics.recordError('ws.connect', 'untrusted_ws_url')
      throw new Error('UNTRUSTED_WS_URL')
    }
    this.open()
    const started = Date.now()
    while (
      !this.ready &&
      this.active &&
      Date.now() - started < this.config.readyTimeoutSeconds * 1000
    )
      await delay(25)
    metrics.readyOK.add(this.ready)
    if (!this.ready) {
      metrics.recordError('ws.ready', 'timeout')
      throw new Error('WS_READY_TIMEOUT')
    }
    await this.refresh(topics)
    this.heartbeat = setInterval(() => {
      if (!this.active) return
      if (Date.now() - this.lastReconciled >= (this.ready ? 300_000 : 60_000)) {
        this.lastReconciled = Date.now()
        this.queue.invalidate(topics)
      }
      if (this.socket?.readyState === 1 && this.ready) {
        if (Date.now() - this.lastPong > 90_000) {
          this.connectionChanged(false)
          this.socket.close()
        } else this.socket.send('ping')
      }
    }, 30_000)
  }

  private open(): void {
    if (!this.active) return
    const started = Date.now()
    const socket = new LoadWebSocket(
      this.auth.wsUrl,
      ['veto', `token.${this.auth.token}`, 'live.v1'],
      {
        tags: { name: 'live.connect' }
      }
    )
    this.socket = socket
    socket.addEventListener('open', () => {
      this.lastPong = Date.now()
      this.lastReconciled = Date.now()
      this.queue.invalidate(topics)
    })
    socket.addEventListener('message', (event) => {
      if (!this.active || this.socket !== socket) return
      if (event.data === 'pong') {
        this.lastPong = Date.now()
        return
      }
      let message: { type?: string; topics?: Topic[]; kind?: string }
      try {
        message = JSON.parse(String(event.data))
      } catch {
        metrics.recordError('ws.message', 'invalid_json')
        return
      }
      if (message.type === 'ready') {
        this.ready = true
        this.connectionChanged(true)
        this.failures = 0
        metrics.readyMs.add(Date.now() - started)
        if (this.reconnectStarted) {
          metrics.reconnectMs.add(Date.now() - this.reconnectStarted)
          metrics.reconnectOK.add(true)
          this.reconnectStarted = 0
        }
      } else if (message.type === 'invalidate' && Array.isArray(message.topics)) {
        this.received++
        metrics.notifications.add(1)
        this.queue.invalidate(message.topics.filter((topic) => topics.includes(topic)))
      } else if (message.kind?.startsWith('file.')) {
        this.received++
        metrics.notifications.add(1)
        this.queue.invalidate(['notifications', 'files'])
      }
    })
    socket.addEventListener('close', (event) => {
      if (this.socket !== socket) return
      this.ready = false
      this.connectionChanged(false)
      if (event.code === 1008) {
        this.expired = true
        metrics.sessionExpired.add(1)
        metrics.recordError('ws.close', 'session_expired', 1008)
      } else if (this.active) {
        if (!this.reconnectStarted) {
          this.reconnectStarted = Date.now()
          metrics.unexpectedCloses.add(1)
          console.warn(
            JSON.stringify({
              operation: 'ws.close',
              kind: 'unexpected_close',
              status: event.code,
              impact: 'reconnecting'
            })
          )
        }
        this.retry = setTimeout(() => this.open(), reconnectDelay(this.failures++))
      }
    })
    socket.addEventListener('error', () => {
      if (this.socket !== socket) return
      this.connectionChanged(false)
      if (this.active)
        console.warn(
          JSON.stringify({
            operation: 'ws.connect',
            kind: 'transport_error',
            impact: 'reconnecting'
          })
        )
      socket.close()
    })
  }

  async reconnect(): Promise<void> {
    this.connectionChanged(false)
    this.reconnectStarted = Date.now()
    this.ready = false
    const previous = this.socket
    // Fault injection must not wait for a graceful close handshake to time out.
    // Detach callbacks from the old transport before starting the client retry.
    this.socket = undefined
    previous?.close()
    this.retry = setTimeout(() => this.open(), reconnectDelay(0))
    const deadline = Date.now() + this.config.readyTimeoutSeconds * 1000
    while (!this.ready && this.active && Date.now() < deadline) await delay(50)
    if (!this.ready) {
      metrics.reconnectOK.add(false)
      metrics.recordError('ws.reconnect', 'timeout')
      throw new Error('RECONNECT_TIMEOUT')
    }
    await this.refresh(topics)
  }

  private observe(items: Content[]): void {
    for (const item of items) {
      const time = markerTime(item, this.runId)
      const key = `${item.id}:${item.status}`
      if (time) {
        this.firstSeen.remember(item.id, item.status, Date.now())
      }
      if (!time || this.observed.has(key)) continue
      this.observed.add(key)
      if (this.observed.size > 2000) this.observed.delete(this.observed.values().next().value!)
      if (item.status === 'published') metrics.observedMs.add(Math.max(0, Date.now() - time))
    }
  }

  async list(path: string, key: string, operation: string): Promise<Content[]> {
    const items = await this.api.list(path, key, operation)
    this.observe(items)
    return items
  }

  async refresh(changed: Topic[]): Promise<void> {
    if (!this.active) return
    const started = Date.now()
    const jobs: Promise<unknown>[] = []
    const read = (capability: string, path: string, key: string, name: string) => {
      if (this.can(capability)) jobs.push(this.list(path, key, name))
    }
    if (changed.includes('files')) {
      read('view_files', '/veto/files', 'files', 'files.list')
      read('send_files', '/veto/files/mine', 'files', 'files.mine')
      read('review_files', '/veto/files/workflow', 'files', 'files.workflow')
      read(
        'review_files',
        '/veto/files/visibility-workflow',
        'requests',
        'files.visibility_workflow'
      )
    }
    if (changed.includes('news')) {
      read('view_news', '/veto/news', 'news', 'news.list')
      read('draft_news', '/veto/news/mine', 'news', 'news.mine')
      read('review_news', '/veto/news/workflow', 'news', 'news.workflow')
    }
    if (changed.includes('directives')) {
      read('submit_directive', '/veto/directives/mine', 'directives', 'directives.mine')
      read('process_directive', '/veto/directives/workflow', 'directives', 'directives.workflow')
    }
    if (changed.includes('situations'))
      read('view_situation', '/veto/situations', 'situations', 'situations.list')
    if (
      changed.includes('timeline') &&
      ['view_situation', 'publish_situation', 'control_timeline'].some((cap) => this.can(cap))
    ) {
      jobs.push(this.api.json('GET', '/veto/timeline', 'timeline.get'))
    }
    if (changed.includes('notifications')) jobs.push(this.syncNotifications())
    const settled = await Promise.allSettled(jobs)
    metrics.refreshes.add(1)
    metrics.refreshMs.add(Date.now() - started)
    if (settled.some((result) => result.status === 'rejected')) throw new Error('REFRESH_FAILED')
  }

  private async syncNotifications(): Promise<void> {
    try {
      await this.feed.sync()
    } catch (error) {
      metrics.recordError(
        'notifications.list',
        error instanceof Error && error.message === 'cursor_not_advancing'
          ? 'cursor_not_advancing'
          : 'notification_read_failed'
      )
      throw error
    }
  }

  async waitVisible(
    path: string,
    key: string,
    id: string,
    started: number,
    status?: string
  ): Promise<Content | null> {
    const deadline = Date.now() + this.config.visibilityTimeoutSeconds * 1000
    let item: Content | undefined
    do {
      const items = await this.list(path, key, `${key}.verify`)
      item = items.find(
        (candidate) => candidate.id === id && (!status || candidate.status === status)
      )
      if (item) break
      await delay(500)
    } while (this.active && Date.now() < deadline)
    metrics.visibleOK.add(Boolean(item))
    if (item)
      metrics.visibleMs.add(Math.max(0, (this.firstSeen.get(id, status) ?? Date.now()) - started))
    else metrics.recordError(`${key}.visible`, 'timeout')
    return item ?? null
  }

  async close(): Promise<void> {
    this.connectionChanged(false)
    if (this.config.scenario === 'files' || this.config.scenario === 'mixed') {
      metrics.deliveryOK.add(this.received > 0)
      if (!this.received) metrics.recordError('live.delivery', 'no_notification_received')
    }
    this.stopped = true
    clearTimeout(this.retry)
    clearInterval(this.heartbeat)
    this.socket?.close()
    await this.queue.close()
    if (this.reconnectStarted) metrics.reconnectOK.add(false)
  }
}
