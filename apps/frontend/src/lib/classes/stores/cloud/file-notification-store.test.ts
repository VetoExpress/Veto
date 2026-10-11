import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { listNotifications } = vi.hoisted(() => ({ listNotifications: vi.fn() }))
vi.mock('$lib/classes/clients/cloud-file-client', () => ({ listFileNotifications: listNotifications }))

class Socket {
  static OPEN = 1
  static instances: Socket[] = []
  readyState = 0
  onopen?: () => void
  onmessage?: (event: { data: string }) => void
  onclose?: (event: { code: number }) => void
  onerror?: () => void
  constructor(readonly url: string, readonly protocols: string[]) { Socket.instances.push(this) }
  open(): void { this.readyState = 1; this.onopen?.() }
  receive(data: unknown): void { this.onmessage?.({ data: JSON.stringify(data) }) }
  send(data: string): void {
    if (data === 'ping') this.onmessage?.({ data: 'pong' })
  }
  close(code = 1000): void { this.readyState = 3; this.onclose?.({ code }) }
}

let cleanup: (() => void) | undefined
beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  Socket.instances = []
  listNotifications.mockReset().mockResolvedValue({ notifications: [], nextCursor: 0 })
  vi.stubGlobal('WebSocket', Socket)
  vi.stubGlobal('window', globalThis)
  vi.stubGlobal('document', { hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() })
})
afterEach(() => {
  cleanup?.()
  cleanup = undefined
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('shared live connection', () => {
  it('uses one connection, avoids periodic HTTP reads while healthy, and reconciles every five minutes', async () => {
    const { fileNotifications } = await import('./file-notification-store.svelte')
    const refresh = vi.fn()
    const unsubscribe = fileNotifications.subscribe(['news'], refresh)
    const disconnect = fileNotifications.connect('token', 'wss://api/veto/ws', 'conference', 'seat')
    cleanup = () => { unsubscribe(); disconnect() }
    const socket = Socket.instances[0]
    socket.open()
    socket.receive({ type: 'ready' })
    await vi.advanceTimersByTimeAsync(250)
    expect(Socket.instances).toHaveLength(1)
    expect(listNotifications).toHaveBeenCalledTimes(1)
    refresh.mockClear()
    await vi.advanceTimersByTimeAsync(240_000)
    expect(listNotifications).toHaveBeenCalledTimes(1)
    expect(refresh).not.toHaveBeenCalled()
    socket.receive({ type: 'invalidate', topics: ['news'] })
    socket.receive({ type: 'invalidate', topics: ['news'] })
    await vi.advanceTimersByTimeAsync(250)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(listNotifications).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(listNotifications).toHaveBeenCalledTimes(2)
  })

  it('uses a one-minute fallback for old servers and stops after session revocation', async () => {
    const { fileNotifications } = await import('./file-notification-store.svelte')
    cleanup = fileNotifications.connect('token', 'wss://api/veto/ws', 'conference', 'seat')
    const socket = Socket.instances[0]
    socket.open()
    await vi.advanceTimersByTimeAsync(250)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(listNotifications).toHaveBeenCalledTimes(2)
    socket.close(1008)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(Socket.instances).toHaveLength(1)
    expect(listNotifications).toHaveBeenCalledTimes(2)
  })

  it('refreshes subscribed data after reconnecting', async () => {
    const { fileNotifications } = await import('./file-notification-store.svelte')
    const refresh = vi.fn()
    const unsubscribe = fileNotifications.subscribe(['directives'], refresh)
    const disconnect = fileNotifications.connect('token', 'wss://api/veto/ws', 'conference', 'seat')
    cleanup = () => { unsubscribe(); disconnect() }
    Socket.instances[0].open()
    Socket.instances[0].receive({ type: 'ready' })
    await vi.advanceTimersByTimeAsync(250)
    refresh.mockClear()
    Socket.instances[0].close()
    await vi.advanceTimersByTimeAsync(2000)
    expect(Socket.instances).toHaveLength(2)
    Socket.instances[1].open()
    Socket.instances[1].receive({ type: 'ready' })
    await vi.advanceTimersByTimeAsync(250)
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
