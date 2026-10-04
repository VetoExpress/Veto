/**
 * data/store.ts — 应用级数据持久化
 *
 * 所有 Veto 实例共享的 domain-level 存储。
 *
 *   Windows: %APPDATA%/Veto/store/{domain}.json
 *
 * 域名:
 * - conferences.json — 模拟大会数据
 * - battles.json     — 推演战局数据
 * - settings.json    — 全局设置
 * - tools.json       — 时间线/工具数据
 */

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { createLogger } from '../logger'

const log = createLogger('DataStore')

/** 数据域 */
export type StoreDomain =
  | 'conferences'
  | 'checkpoints'
  | 'events'
  | 'battles'
  | 'settings'
  | 'tools'

/** 数据域 → 文件名映射 */
const FILES: Record<StoreDomain, string> = {
  conferences: 'conferences.json',
  checkpoints: 'committee-checkpoints.json',
  events: 'conference-events.json',
  battles: 'battles.json',
  settings: 'settings.json',
  tools: 'tools.json'
}

/** 获取存储根目录 */
function getStoreDir(): string {
  return path.join(app.getPath('appData'), 'Veto', 'store')
}

/** 获取指定数据域的完整文件路径 */
function getFilePath(domain: StoreDomain): string {
  return path.join(getStoreDir(), FILES[domain])
}

/**
 * 读取指定域的数据。
 * @returns 解析后的对象，文件不存在或解析失败返回 `null`
 */
export function loadStore<T>(domain: StoreDomain): T | null {
  const filePath = getFilePath(domain)

  if (!fs.existsSync(filePath)) {
    return null
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as T
  } catch (err) {
    log.error(`Failed to read ${domain}:`, err)
    if (domain === 'conferences' || domain === 'checkpoints') throw err
    return null
  }
}

/**
 * 保存数据到指定域。
 * 自动创建目录。写入失败会抛出异常。
 */
export function saveStore<T>(domain: StoreDomain, data: T): void {
  const dir = getStoreDir()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const filePath = getFilePath(domain)
  try {
    const temporaryPath = `${filePath}.${process.pid}.tmp`
    fs.writeFileSync(temporaryPath, JSON.stringify(data, null, 2), 'utf-8')
    fs.renameSync(temporaryPath, filePath)
  } catch (err) {
    log.error(`Failed to save ${domain}:`, err)
    throw err
  }
}

/**
 * 删除指定域的数据文件。
 * 文件不存在时静默跳过（no-op）。
 */
export function deleteStore(domain: StoreDomain): void {
  const filePath = getFilePath(domain)
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      log.info(`Deleted ${domain}`)
    }
  } catch (err) {
    log.error(`Failed to delete ${domain}:`, err)
  }
}

/**
 * 从 localStorage 迁移数据到文件（仅当文件不存在时写入）。
 * 用于首次升级时的数据迁移。
 */
export function migrateFromLocalStorage(domain: StoreDomain, jsonData: string): void {
  if (loadStore(domain) !== null) {
    log.info(`${domain} file exists, skip migration`)
    return
  }

  try {
    const parsed = JSON.parse(jsonData)
    saveStore(domain, parsed)
    log.info(`Migrated ${domain} from localStorage`)
  } catch (err) {
    log.warn(`Invalid data during ${domain} migration:`, err)
  }
}
