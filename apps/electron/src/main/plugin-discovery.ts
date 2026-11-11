/**
 * plugin-discovery.ts — 扫描 {userData}/plugins/ 目录，发现已安装插件
 *
 * 对齐 LiteLoaderQQNT 的 scanPluginDirectory() 模式：
 * - 遍历 plugins/ 下的每个子目录
 * - 读取 manifest.json 确认插件身份
 * - 返回 PluginInstance 列表供后续加载
 */

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { createLogger } from './logger'

const log = createLogger('PluginDiscovery')

// ═══════════════════════════════════════════════════════════════════
// PluginManifest — discriminated union
//
// 每种插件类型拥有独立的必填/可选字段。
// TypeScript 会根据 `type` 自动收窄，编译期防止访问不存在的字段。
// ═══════════════════════════════════════════════════════════════════

/** 所有插件类型共享的基础字段 */
export interface BaseManifest {
  manifest_version: number
  id: string
  name: string
  version: string
  author: string
  repo: string
  description?: string
  hash?: string
  preview?: string
  download_url?: string
  min_engine_version?: string
  dependencies?: string[]
  tags?: string[]
  license?: string
  /** i18n 声明：字符串指向 i18n/ 目录，对象为内联翻译 */
  i18n?: string | Record<string, string>
}

/** faction 插件：提供派系/国家定义数据 */
export interface FactionManifest extends BaseManifest {
  type: 'faction'
  /** 定义文件路径 或 内联定义对象 */
  definitions: string | Record<string, string>
  /** 注入点：formulas / events / ui 脚本路径 */
  injects?: {
    formulas?: string
    events?: string
    ui?: string
  }
  /** 席位预设文件路径 */
  seats?: string
}

/** campaign 插件：提供战役/推演场景 */
export interface CampaignManifest extends BaseManifest {
  type: 'campaign'
  definitions: string | Record<string, string>
  /** 战役资源文件路径 */
  mapConfig?: string
  deployments?: string
  facilities?: string
  events?: string
  seats?: string
  injects?: {
    formulas?: string
    events?: string
    ui?: string
  }
}

/** utility 插件：提供可执行的服务/工具 */
export interface UtilityManifest extends BaseManifest {
  type: 'utility'
  /** 服务入口文件路径（如 "./service.mjs"） */
  service?: string
  /** 运行时标识（如 "nodejs"）。默认 "nodejs" */
  runtime?: string
}

/** dependency 插件：纯依赖声明，无业务逻辑 */
export interface DependencyManifest extends BaseManifest {
  type: 'dependency'
}

/** preset 插件：预置配置/席位模板 */
export interface PresetManifest extends BaseManifest {
  type: 'preset'
  definitions?: string | Record<string, string>
  seats?: string
}

/** 所有插件清单的联合类型 */
export type PluginManifest =
  FactionManifest | CampaignManifest | UtilityManifest | DependencyManifest | PresetManifest

/** 插件实例（扫描发现后的内存表示） */
export interface PluginInstance {
  manifest: PluginManifest
  path: {
    /** 插件根目录（如 {userData}/Plugins/my-faction） */
    plugin: string
    /** definitions.json 的绝对路径，或 definitions/ 目录的绝对路径 */
    definitions?: string
    /** definitions 是否为目录（true=目录扫描合并，false=单文件） */
    definitionsIsDir?: boolean
    /** i18n 目录的绝对路径 */
    i18n?: string
    /** assets 目录的绝对路径 */
    assets?: string
    /** 战役：map.json 绝对路径 */
    mapConfig?: string
    /** 战役：deployments.json 绝对路径 */
    deployments?: string
    /** 战役：facilities.json 绝对路径 */
    facilities?: string
    /** 战役：events.json 绝对路径 */
    events?: string
    /** 会议：seats.json 绝对路径 */
    seats?: string
    /** 服务插件：service.mjs 绝对路径 */
    service?: string
  }
  /** 是否被用户禁用 */
  disabled: boolean
  /** 是否与当前引擎版本不兼容 */
  incompatible: boolean
}

/** 获取插件根目录 */
export function getPluginsDir(): string {
  return path.join(app.getPath('userData'), 'Plugins')
}

/** 确保插件目录存在 */
export function ensurePluginsDir(): string {
  const dir = getPluginsDir()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

/**
 * 扫描 plugins/ 目录，返回发现的插件列表。
 * 不加载插件内容，仅收集元数据。
 * 按插件类型分派资源路径解析，确保 discriminated union 的类型安全。
 */
export function scanPluginDirectory(): PluginInstance[] {
  const pluginsDir = getPluginsDir()

  if (!fs.existsSync(pluginsDir)) {
    log.info('Plugins directory does not exist, creating...')
    fs.mkdirSync(pluginsDir, { recursive: true })
    return []
  }

  const entries = fs.readdirSync(pluginsDir, { withFileTypes: true })
  const plugins: PluginInstance[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const pluginDir = path.join(pluginsDir, entry.name)
    const manifestPath = path.join(pluginDir, 'manifest.json')

    if (!fs.existsSync(manifestPath)) {
      log.warn(`Skipping ${entry.name}: no manifest.json`)
      continue
    }

    try {
      const raw = fs.readFileSync(manifestPath, 'utf-8')
      const manifest = JSON.parse(raw) as PluginManifest

      if (!manifest.id?.trim() || !manifest.name?.trim()) {
        log.warn(`Skipping ${entry.name}: invalid manifest (missing id/name)`)
        continue
      }

      // 解析插件资源路径（按类型分派）
      const instancePath = resolveInstancePaths(pluginDir, manifest)

      plugins.push({
        manifest,
        path: instancePath,
        disabled: false,
        incompatible: false
      })
    } catch (err) {
      log.error(`Failed to read manifest for ${entry.name}:`, err)
    }
  }

  log.info(`Found ${plugins.length} plugin(s) in ${pluginsDir}`)
  return plugins
}

/** 按插件类型解析资源文件路径 */
function resolveInstancePaths(pluginDir: string, manifest: PluginManifest): PluginInstance['path'] {
  const i18nPath = path.join(pluginDir, 'i18n')
  const assetsPath = path.join(pluginDir, 'assets')

  const base = {
    plugin: pluginDir,
    definitions: undefined as string | undefined,
    definitionsIsDir: false,
    i18n: fs.existsSync(i18nPath) ? i18nPath : undefined,
    assets: fs.existsSync(assetsPath) ? assetsPath : undefined,
    mapConfig: undefined as string | undefined,
    deployments: undefined as string | undefined,
    facilities: undefined as string | undefined,
    events: undefined as string | undefined,
    seats: undefined as string | undefined,
    service: undefined as string | undefined
  }

  // 处理 definitions（faction / campaign / preset 有该字段）
  if (manifest.type === 'faction' || manifest.type === 'campaign' || manifest.type === 'preset') {
    const def = 'definitions' in manifest ? manifest.definitions : undefined
    const resolved = resolveDefinitions(pluginDir, def)
    if (resolved) {
      base.definitions = resolved.path
      base.definitionsIsDir = resolved.isDir
    }
  }

  // 处理 service 入口（仅 utility）
  if (manifest.type === 'utility' && manifest.service) {
    const servicePath = path.join(pluginDir, manifest.service)
    if (fs.existsSync(servicePath)) {
      base.service = servicePath
    }
  }

  // 处理战役资源文件（仅 campaign）
  if (manifest.type === 'campaign') {
    base.mapConfig = resolveCampaignFile(pluginDir, manifest.mapConfig, 'map.json')
    base.deployments = resolveCampaignFile(pluginDir, manifest.deployments, 'deployments.json')
    base.facilities = resolveCampaignFile(pluginDir, manifest.facilities, 'facilities.json')
    base.events = resolveCampaignFile(pluginDir, manifest.events, 'events.json')
  }

  // 处理席位预设（faction / campaign / preset）
  if (manifest.type === 'faction' || manifest.type === 'campaign' || manifest.type === 'preset') {
    const seatsFile = 'seats' in manifest ? manifest.seats : undefined
    base.seats = resolveCampaignFile(pluginDir, seatsFile, 'seats.json')
  }

  return base
}

/** 解析 definitions 路径：单文件 / 目录 / manifest 声明 */
function resolveDefinitions(
  pluginDir: string,
  declared: string | Record<string, unknown> | undefined
): { path: string; isDir: boolean } | null {
  const filePath = path.join(pluginDir, 'definitions.json')
  const dirPath = path.join(pluginDir, 'definitions')

  if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
    return { path: dirPath, isDir: true }
  }
  if (fs.existsSync(filePath)) {
    return { path: filePath, isDir: false }
  }
  if (typeof declared === 'string' && declared.endsWith('/')) {
    return { path: path.join(pluginDir, declared), isDir: true }
  }
  if (typeof declared === 'string') {
    return { path: path.join(pluginDir, declared), isDir: false }
  }
  return null
}

/** 解析战役/席位文件路径 */
function resolveCampaignFile(
  pluginDir: string,
  manifestPath: string | undefined,
  defaultName: string
): string | undefined {
  if (manifestPath) {
    const fullPath = path.join(pluginDir, manifestPath)
    return fs.existsSync(fullPath) ? fullPath : undefined
  }
  const defaultPath = path.join(pluginDir, defaultName)
  return fs.existsSync(defaultPath) ? defaultPath : undefined
}
