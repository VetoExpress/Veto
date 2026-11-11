/**
 * ipc/event-bus.ts — 事件总线 IPC 处理器
 *
 * 接收 Renderer 进程发出的事件，转发到主进程的 EventBus。
 * EventBus 分发到所有匹配的订阅者（插件、PluginServer 等）。
 */

import { ipcMain } from 'electron'
import { eventBus } from '../event-bus'

export function registerEventBusIpc(): void {
  ipcMain.on(
    'veto:event-bus:emit',
    (_event, payload: { type: string; data?: Record<string, unknown> }) => {
      eventBus.emit(payload.type, payload.data ?? {})
    }
  )
}
