import { WebSocket } from 'k6/websockets'
import type { Params } from 'k6/websockets'

// @types/k6 2.3.1 still declares protocols as null and omits close-event codes.
// These declarations match the pinned k6 v2.3.0 implementation; local Worker tests exercise both.
type Events = {
  open: Record<string, never>
  message: { data: string | ArrayBuffer }
  close: { code: number; reason: string }
  error: { error?: string }
}
export type LoadSocket = Omit<WebSocket, 'addEventListener'> & {
  addEventListener<K extends keyof Events>(event: K, listener: (event: Events[K]) => void): void
}
export const LoadWebSocket = WebSocket as unknown as {
  new (url: string, protocols?: string[], params?: Params): LoadSocket
}
