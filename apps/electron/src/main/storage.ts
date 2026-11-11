/**
 * storage.ts — 插件 KV 持久化存储
 *
 * 每个插件拥有独立的键值存储空间，数据以 JSON 文件保存在插件目录下。
 * 与 `veto-types/index.d.ts` 中声明的 `Storage` 接口一致。
 *
 * ## 存储位置
 *
 *   {pluginDir}/storage/{key}.json
 *
 * ## 使用
 *
 * ```ts
 * import { createPluginStorage } from './storage'
 *
 * const storage = createPluginStorage('/path/to/plugin')
 * await storage.set('lastOpenFile', '/foo/bar.txt')
 * const val = await storage.get<string>('lastOpenFile')
 * ```
 *
 * 每个操作包裹 try/catch，I/O 异常会记日志但不会抛到调用方（`set` 除外）。
 */

import * as fs from 'fs'
import * as path from 'path'
import { createLogger } from './logger'

const log = createLogger('Storage')

// ═══════════════════════════════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════════════════════════════

/** 插件存储接口 — 与 veto-types/index.d.ts 保持一致 */
export interface PluginStorage {
  get<T = unknown>(key: string): Promise<T | undefined>
  set<T = unknown>(key: string, value: T): Promise<void>
  delete(key: string): Promise<void>
  keys(): Promise<string[]>
}

// ═══════════════════════════════════════════════════════════════════
// 工厂
// ═══════════════════════════════════════════════════════════════════

/**
 * 为指定插件创建 KV 存储实例。
 *
 * @param pluginDir — 插件的安装目录（PluginInstance.path.plugin）
 * @returns 实现 `PluginStorage` 接口的对象
 */
export function createPluginStorage(pluginDir: string): PluginStorage {
  const storageDir = path.join(pluginDir, 'storage')

  // 惰性初始化：首次写入时才创建目录
  const ensureDir = (): void => {
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true })
    }
  }

  const filePath = (key: string): string => path.join(storageDir, `${sanitizeKey(key)}.json`)

  return {
    async get<T = unknown>(key: string): Promise<T | undefined> {
      try {
        const fp = filePath(key)
        if (!fs.existsSync(fp)) return undefined
        const raw = fs.readFileSync(fp, 'utf-8')
        return JSON.parse(raw) as T
      } catch (err) {
        log.error(`Failed to read key "${key}":`, err)
        return undefined
      }
    },

    async set<T = unknown>(key: string, value: T): Promise<void> {
      ensureDir()
      const fp = filePath(key)
      fs.writeFileSync(fp, JSON.stringify(value, null, 2), 'utf-8')
    },

    async delete(key: string): Promise<void> {
      try {
        const fp = filePath(key)
        if (fs.existsSync(fp)) {
          fs.unlinkSync(fp)
        }
      } catch (err) {
        log.error(`Failed to delete key "${key}":`, err)
      }
    },

    async keys(): Promise<string[]> {
      try {
        if (!fs.existsSync(storageDir)) return []
        return fs
          .readdirSync(storageDir)
          .filter((f) => f.endsWith('.json'))
          .map((f) => f.slice(0, -5)) // 去掉 .json 后缀
      } catch {
        return []
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// 辅助
// ═══════════════════════════════════════════════════════════════════

/** 防止路径穿越：只保留字母数字、连字符、下划线、点 */
function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]/g, '_')
}
