/**
 * notifications.ts — 插件通知 API
 *
 * 为插件提供 toast 级别的用户通知能力。
 * 底层通过 IPC 桥接到 Renderer 进程，由 svelte-sonner 渲染。
 *
 * ## 使用
 *
 * ```ts
 * import { notifications } from 'veto'
 *
 * notifications.show('插件就绪')
 * notifications.show('连接断开', { level: 'error' })
 * ```
 *
 * 未来可扩展为带按钮/回调的交互式通知。
 */

import { BrowserWindow } from 'electron'

// ═══════════════════════════════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════════════════════════════

/** 通知级别 */
export type NotificationLevel = 'info' | 'success' | 'warn' | 'error'

/** 通知选项 */
export interface NotificationOptions {
  level?: NotificationLevel
  /** 显示时长（毫秒），默认 4000 */
  duration?: number
}

// ═══════════════════════════════════════════════════════════════════
// API
// ═══════════════════════════════════════════════════════════════════

export interface PluginNotifications {
  /**
   * 在 Veto UI 中弹出一个 toast 通知。
   *
   * @param message — 通知文本
   * @param options — 通知选项（级别、时长等）
   */
  show(message: string, options?: NotificationOptions): void
}

/**
 * 创建通知实例。
 * 打包进 `veto` 模块后提供给所有插件。
 */
export function createNotifications(): PluginNotifications {
  return {
    show(message: string, options?: NotificationOptions): void {
      const payload = {
        event: 'veto:notification',
        data: {
          message,
          level: options?.level ?? 'info',
          duration: options?.duration ?? 4000,
          timestamp: Date.now()
        }
      }

      for (const win of BrowserWindow.getAllWindows()) {
        try {
          win.webContents.send('veto:event', payload)
        } catch {
          /* window may be closed */
        }
      }
    }
  }
}
