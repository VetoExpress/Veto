import { listFileNotifications, type FileNotification } from '$lib/classes/clients/cloud-file-client'
import { LiveRefresh, type LiveTopic } from '$lib/classes/services/live-refresh'

class FileNotificationStore {
  latest = $state<FileNotification | null>(null)
  revision = $state(0)
  private refresh = new LiveRefresh()

  subscribe(topics: LiveTopic[], refresh: () => void | Promise<void>): () => void {
    return this.refresh.subscribe(topics, refresh)
  }

  dismiss(): void {
    this.latest = null
  }

  connect(token: string, wsUrl: string, conferenceId: string, seatId: string): () => void {
    this.latest = null
    const key = `veto.file-notifications:${conferenceId}:${seatId}`
    const stored = Number(localStorage.getItem(key) ?? '0')
    let cursor = Number.isSafeInteger(stored) && stored >= 0 ? stored : 0
    let socket: WebSocket | null = null
    let retry: number | null = null
    let active = true
    let ready = false
    let sessionExpired = false
    let failures = 0
    let lastPong = Date.now()
    let lastReconciled = Date.now()
    let syncing = false
    let queued = false

    const sync = async (): Promise<void> => {
      if (!active) return
      if (syncing) { queued = true; return }
      syncing = true
      try {
        for (let page = 0; page < 10; page++) {
          const result = await listFileNotifications(token, cursor)
          if (!active || !result.notifications.length) break
          cursor = result.nextCursor
          localStorage.setItem(key, String(cursor))
          this.latest = result.notifications.at(-1) ?? null
          this.revision += 1
          if (result.notifications.length < 200) break
        }
      } catch {
        // The next WebSocket event or periodic check will retry the durable feed.
      } finally {
        syncing = false
        if (queued && active) {
          queued = false
          void sync()
        }
      }
    }

    const unsubscribe = this.subscribe(['notifications'], sync)
    const visibility = (): void => {
      this.refresh.setVisible(!document.hidden)
      if (!sessionExpired && !document.hidden && Date.now() - lastReconciled >= 60_000) reconcile()
    }
    const reconcile = (): void => {
      lastReconciled = Date.now()
      this.refresh.invalidate()
    }
    visibility()
    document.addEventListener('visibilitychange', visibility)

    const open = (): void => {
      if (!active || !wsUrl) return
      const connection = new WebSocket(wsUrl, ['veto', `token.${token}`, 'live.v1'])
      socket = connection
      connection.onopen = () => {
        lastPong = Date.now()
        // Old servers do not announce ready; keep the disconnected fallback for them.
        reconcile()
      }
      connection.onmessage = (event) => {
        if (!active || socket !== connection) return
        if (event.data === 'pong') { lastPong = Date.now(); return }
        let message: { type?: string; topics?: LiveTopic[]; kind?: string }
        try { message = JSON.parse(event.data) } catch { return }
        if (message.type === 'ready') { ready = true; failures = 0; return }
        if (message.type === 'invalidate' && Array.isArray(message.topics)) {
          this.refresh.invalidate(message.topics)
        } else if (message.kind?.startsWith('file.')) {
          this.refresh.invalidate(['notifications', 'files'])
        }
      }
      connection.onclose = (event) => {
        ready = false
        if (event.code === 1008) sessionExpired = true
        if (active && event.code !== 1008) {
          const delay = Math.min(60_000, 1000 * 2 ** Math.min(failures++, 6))
          retry = window.setTimeout(open, delay + Math.random() * 1000)
        }
      }
      connection.onerror = () => connection.close()
    }

    this.refresh.invalidate(['notifications'])
    open()
    const interval = window.setInterval(() => {
      if (active && !sessionExpired && !document.hidden && Date.now() - lastReconciled >= (ready ? 300_000 : 60_000)) reconcile()
      if (socket?.readyState === WebSocket.OPEN && ready) {
        if (Date.now() - lastPong > 90_000) socket.close()
        else socket.send('ping')
      }
    }, 30_000)
    return () => {
      active = false
      this.latest = null
      unsubscribe()
      document.removeEventListener('visibilitychange', visibility)
      window.clearInterval(interval)
      if (retry !== null) window.clearTimeout(retry)
      socket?.close()
    }
  }
}

export const fileNotifications = new FileNotificationStore()
