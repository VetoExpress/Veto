/**
 * api.ts — veto 虚拟模块的运行时 API 实现
 *
 * 构建 `import { logger, events, storage, ... } from 'veto'` 返回的对象。
 * 每个插件调用 `createVetoApi()` 获得独立实例（logger + storage 按插件隔离，
 * events / conference / timeline / notifications 为全局共享单例）。
 */

import { eventBus } from '../../event-bus'
import { createPluginStorage, type PluginStorage } from '../../storage'
import { createNotifications, type PluginNotifications } from '../../notifications'
import {
  listConferences,
  getConference,
  updateConference,
  listTimelines,
  getTimeline,
  updateTimeline
} from '../../data'
import { createLogger as createMainLogger, type Logger as MainLogger } from '../../logger'

// ═══════════════════════════════════════════════════════════════════
// Logger
// ═══════════════════════════════════════════════════════════════════

/** 暴露给插件的 Logger 接口 */
export interface VetoLogger {
  info(message: string): void
  warn(message: string): void
  error(error: Error | string): void
  debug(message: string): void
}

/**
 * 为指定插件创建一个带命名空间的 logger。
 * 输出格式: [VetoExpress][plugin-id][LEVEL] message
 */
export function createPluginLogger(pluginId: string): VetoLogger {
  const mainLogger: MainLogger = createMainLogger(`Plugin:${pluginId}`)

  return {
    info(message: string): void {
      console.log(`[VetoExpress][${pluginId}][INFO] ${message}`)
      mainLogger.info(message)
    },
    warn(message: string): void {
      console.warn(`[VetoExpress][${pluginId}][WARN] ${message}`)
      mainLogger.warn(message)
    },
    error(error: Error | string): void {
      const msg = typeof error === 'string' ? error : error.message
      console.error(`[VetoExpress][${pluginId}][ERROR] ${msg}`)
      if (typeof error !== 'string') {
        console.error(error.stack)
      }
      mainLogger.error(msg)
    },
    debug(message: string): void {
      console.debug(`[VetoExpress][${pluginId}][DEBUG] ${message}`)
      mainLogger.debug(message)
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// EventBus（插件视角）
// ═══════════════════════════════════════════════════════════════════

/** 完整事件负载，包含类型与时间戳 */
export interface VetoEventPayload {
  type: string
  timestamp: number
  data: Record<string, unknown>
}

/** 暴露给插件的 EventBus 接口 */
export interface VetoEventBus {
  /** 订阅事件，返回取消订阅函数。回调接收完整负载（含 type/timestamp/data）。 */
  on(pattern: string, handler: (payload: VetoEventPayload) => void): () => void
  /** 分发事件 */
  emit(type: string, data?: Record<string, unknown>): void
}

/** 包装全局 EventBus，提供插件友好的接口 */
function createPluginEventBus(): VetoEventBus {
  return {
    on(pattern: string, handler: (payload: VetoEventPayload) => void): () => void {
      return eventBus.on(pattern, (payload) => {
        handler(payload)
      })
    },
    emit(type: string, data?: Record<string, unknown>): void {
      eventBus.emit(type, data ?? {})
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// 共享单例（所有插件共用）
// ═══════════════════════════════════════════════════════════════════

const _sharedEvents = createPluginEventBus()
const _sharedNotifications = createNotifications()

const _sharedConference = {
  list: listConferences,
  get: getConference,
  update: updateConference
}

const _sharedTimeline = {
  list: listTimelines,
  get: getTimeline,
  update: updateTimeline
}

// ═══════════════════════════════════════════════════════════════════
// PluginContext
// ═══════════════════════════════════════════════════════════════════

/** 注入到 activate(context) 的上下文对象 */
export interface VetoPluginContext {
  readonly id: string
  readonly logger: VetoLogger
  readonly extensionPath: string
  readonly metadata: Record<string, unknown>
  readonly events: VetoEventBus
  readonly storage: PluginStorage
  readonly conference: typeof _sharedConference
  readonly timeline: typeof _sharedTimeline
  readonly notifications: PluginNotifications
}

/** 创建 PluginContext 的工厂选项 */
export interface CreateContextOptions {
  pluginId: string
  extensionPath: string
  metadata?: Record<string, unknown>
}

export function createPluginContext(options: CreateContextOptions): VetoPluginContext {
  return {
    id: options.pluginId,
    logger: createPluginLogger(options.pluginId),
    extensionPath: options.extensionPath,
    metadata: options.metadata ?? {},
    events: _sharedEvents,
    storage: createPluginStorage(options.extensionPath),
    conference: _sharedConference,
    timeline: _sharedTimeline,
    notifications: _sharedNotifications
  }
}

// ═══════════════════════════════════════════════════════════════════
// Veto API — `import ... from "veto"` 返回的对象
// ═══════════════════════════════════════════════════════════════════

/** 插件的 `import from 'veto'` 模块 */
export interface VetoApi {
  logger: VetoLogger
  events: VetoEventBus
  storage: PluginStorage
  conference: typeof _sharedConference
  timeline: typeof _sharedTimeline
  notifications: PluginNotifications
}

/**
 * 为指定插件创建 veto 虚拟模块对象。
 * 由 plugin-loader 注册到 Module._load 拦截表。
 */
export function createVetoApi(pluginId: string, pluginDir: string): VetoApi {
  return {
    logger: createPluginLogger(pluginId),
    events: _sharedEvents,
    storage: createPluginStorage(pluginDir),
    conference: _sharedConference,
    timeline: _sharedTimeline,
    notifications: _sharedNotifications
  }
}
