/**
 * logger.ts — 标准日志工具
 *
 * 基于 electron-log v5 封装，提供模块级日志隔离。
 * 每个文件通过 createLogger(tag) 获取带标签的日志器，
 * 输出格式由 electron-log 管理（时间戳 + 级别 + 标签）。
 *
 * 主进程：
 *   import { createLogger } from './logger'
 *   const log = createLogger('PluginDiscovery')
 *   log.info('Found plugins:', count)
 *   log.error('Failed to load:', err)
 *
 * 渲染进程：
 *   import { createLogger } from '$lib/logger'
 *   const log = createLogger('StatusRegistry')
 *   log.warn('Unknown status:', id)
 */

import { BrowserWindow } from 'electron'
import log from 'electron-log'
import type { LogFunctions } from 'electron-log'

// ── 公共日志接口 ──────────────────────────────────────────────────────────

export type Logger = Pick<LogFunctions, 'debug' | 'info' | 'warn' | 'error'>

// ── 工厂函数 ──────────────────────────────────────────────────────────────

/**
 * 创建一个带标签的模块日志器。
 * 使用 log.scope() 在父 logger 基础上添加标签前缀，
 * transports（console + file）继承父级配置，无需额外设置。
 *
 * @example
 *   const log = createLogger('PluginDiscovery')
 *   log.info('Found plugins:', count)
 *   // → 12:05:01.123 (PluginDiscovery) › Found plugins: 5
 */
export function createLogger(tag: string): Logger {
  return log.scope(tag) as unknown as Logger
}

// ── 全局初始化 ────────────────────────────────────────────────────────────

/**
 * 初始化日志系统。应在 app.whenReady 回调中尽早调用。
 * - 设置文件传输级别为 debug（所有日志写入文件）
 * - 启用 IPC 桥接，使渲染进程可以通过 electron-log/renderer 记录日志
 * - 安装 hook 将主进程日志转发到渲染进程 DevTools
 */
export function initializeLogging(): void {
  log.transports.file.level = 'debug'

  // 安装 hook：将主进程所有日志转发到渲染进程 DevTools
  log.hooks.push((message) => {
    const { data, date, level, scope, variables } = message
    const lines =
      typeof data === 'string'
        ? [data]
        : Array.isArray(data)
          ? data.map((d) => (typeof d === 'string' ? d : JSON.stringify(d)))
          : [JSON.stringify(data)]

    const tag = scope ? `[${scope}]` : ''
    const text = lines.join(' ')

    for (const win of BrowserWindow.getAllWindows()) {
      try {
        // 映射 electron-log level 到 console 方法
        const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'
        win.webContents.send('veto:event', {
          event: 'main:log',
          data: {
            level: method,
            tag,
            message: text,
            timestamp: date.getTime(),
            variables
          }
        })
      } catch {
        /* window may be destroyed */
      }
    }

    return message
  })

  log.initialize()
}

// 导出基础 log 实例供特殊用途（如 autoUpdater.logger）
export { log }
