/**
 * event-bus.ts — 主进程统一事件总线
 *
 * 连接 Renderer 进程发出的状态变更事件到插件的处理函数。
 * 单例模式，全局共享。
 *
 * ## 事件模式
 *
 * - 精确匹配: `conference:phase_changed`
 * - 前缀通配: `conference:*`（匹配所有 conference: 开头的类型）
 * - 全局通配: `*`（匹配所有事件）
 *
 * ## 使用
 *
 * ```ts
 * import { eventBus } from './event-bus'
 *
 * // 订阅
 * const dispose = eventBus.on('conference:*', (payload) => { ... })
 *
 * // 分发
 * eventBus.emit('conference:phase_changed', { phase: 'voting' })
 *
 * // 取消
 * dispose()
 * ```
 *
 * 每个 handler 调用包裹 try/catch，单个订阅者的异常不影响其他订阅者。
 */

import { createLogger } from './logger'

const log = createLogger('EventBus')

/** 事件负载 */
export interface EventPayload {
  type: string
  timestamp: number
  data: Record<string, unknown>
}

/** 事件处理函数 */
export type EventHandler = (payload: EventPayload) => void

/** 取消订阅函数 */
export type Disposable = () => void

class EventBus {
  /** 订阅模式 → handler 集合 */
  private handlers = new Map<string, Set<EventHandler>>()

  // ── 订阅 ──────────────────────────────────────────────────────

  /**
   * 订阅匹配 pattern 的所有事件。
   *
   * @param pattern — 事件类型（精确匹配）或带 `*` 通配符的模式
   *                  例如 `'conference:*'` 或 `'*'`
   * @param handler — 每次匹配事件触发时调用
   * @returns 取消订阅函数（调用即 unsubscribe）
   */
  on(pattern: string, handler: EventHandler): Disposable {
    if (!this.handlers.has(pattern)) {
      this.handlers.set(pattern, new Set())
    }
    this.handlers.get(pattern)!.add(handler)

    return () => {
      this.handlers.get(pattern)?.delete(handler)
      if (this.handlers.get(pattern)?.size === 0) {
        this.handlers.delete(pattern)
      }
    }
  }

  /**
   * 订阅所有事件（等价于 `on('*', handler)`）。
   * 语法糖，方便通配订阅。
   */
  onAny(handler: EventHandler): Disposable {
    return this.on('*', handler)
  }

  // ── 分发 ──────────────────────────────────────────────────────

  /**
   * 分发事件到所有匹配的 handler。
   *
   * 匹配规则：
   * 1. 精确匹配的 pattern（如 `conference:phase_changed`）
   * 2. 前缀通配 pattern（如 `conference:*`）
   * 3. 全局通配 pattern（`*`）
   *
   * 每个 handler 调用包裹 try/catch，单个异常不影响其他订阅者。
   */
  emit(type: string, data: Record<string, unknown> = {}): void {
    const payload: EventPayload = {
      type,
      timestamp: Date.now(),
      data
    }

    // 遍历所有注册的 pattern，检查是否匹配当前 event type
    for (const [pattern, handlers] of this.handlers) {
      if (!matchPattern(pattern, type)) continue

      for (const handler of handlers) {
        try {
          handler(payload)
        } catch (err) {
          log.error(`Handler error for "${type}" (pattern: "${pattern}"):`, err)
        }
      }
    }
  }

  // ── 清理 ──────────────────────────────────────────────────────

  /**
   * 移除匹配 pattern 的所有 handler。
   * 若省略 pattern，清空整个事件总线。
   */
  clear(pattern?: string): void {
    if (pattern) {
      this.handlers.delete(pattern)
    } else {
      this.handlers.clear()
    }
  }
}

// ── 模式匹配 ──────────────────────────────────────────────────────

/**
 * 检查 eventType 是否匹配 pattern。
 *
 * 支持 `*` 通配符：
 * - `'*'` — 匹配所有事件
 * - `'conference:*'` — 匹配所有 `conference:` 开头的事件
 * - `'conference:phase_changed'` — 精确匹配
 *
 * 实现: 将 pattern 中的 `*` 替换为正则 `.*`，锚定首尾。
 * 模式中的正则特殊字符（`.^${}()[]` 等）会被转义以防止注入。
 */
function matchPattern(pattern: string, eventType: string): boolean {
  if (pattern === eventType) return true
  if (pattern === '*') return true

  const regexStr =
    '^' +
    pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // 转义正则特殊字符
      .replace(/\*/g, '.*') + // * → .*
    '$'
  try {
    return new RegExp(regexStr).test(eventType)
  } catch {
    return false
  }
}

/** 全局单例 */
export const eventBus = new EventBus()
