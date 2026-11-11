/**
 * plugin-loader.ts — 插件加载器
 *
 * Host 入口是 module-injector.ts（Module._load 拦截）。
 * 本文件在拦截之上提供：
 *   1. 读取 package.json，解析插件入口
 *   2. 注册 veto 虚拟模块 API → Module._load 返回该 API
 *   3. 动态 import 插件入口 → 插件内 import "veto" 自动注入
 *   4. 调用 activate(context) / deactivate()
 *   5. 内部跟踪所有已加载插件（load / unload / unloadAll）
 */

import * as fs from 'fs'
import * as path from 'path'
import { pathToFileURL } from 'url'
import { createVetoApi, createPluginContext, type VetoApi, type VetoPluginContext } from './api'
import { registerPluginApi, unregisterPluginApi } from './module-injector'
import { createLogger } from '../../logger'

const log = createLogger('PluginLoader')

// ═══════════════════════════════════════════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════════════════════════════════════════

interface PluginPackageJson {
  name?: string
  version?: string
  main?: string
  veto?: Record<string, unknown>
}

interface PluginModule {
  activate?: (context: VetoPluginContext) => void | Promise<void>
  deactivate?: () => void | Promise<void>
}

export interface LoadedPlugin {
  id: string
  name: string
  version: string
  extensionPath: string
  state: 'loading' | 'active' | 'inactive' | 'error'
  startedAt: number
  deactivate?: () => void | Promise<void>
  module?: PluginModule
  vetoApi?: VetoApi
}

// ═══════════════════════════════════════════════════════════════════════════════
// 内部状态 —— 已加载插件注册表
// ═══════════════════════════════════════════════════════════════════════════════

const _loaded = new Map<string, LoadedPlugin>()

// ═══════════════════════════════════════════════════════════════════════════════
// loadPlugin
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 加载并激活一个插件。
 *
 * 流程：
 *   1. 读取 plugin 的 package.json → 获取入口文件 + 元数据
 *   2. 注册 veto 虚拟模块（API 与插件目录绑定）
 *   3. dynamic import 插件入口 → 插件内 import "veto" 被 Module._load 拦截
 *   4. 调用 module.activate(context)
 */
export async function loadPlugin(pluginPath: string, pluginId?: string): Promise<LoadedPlugin> {
  // 1. 验证
  if (!fs.existsSync(pluginPath) || !fs.statSync(pluginPath).isDirectory()) {
    throw new Error(`Plugin directory not found: ${pluginPath}`)
  }

  // 2. package.json
  const pkgPath = path.join(pluginPath, 'package.json')
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`Plugin missing package.json: ${pluginPath}`)
  }

  let pkg: PluginPackageJson
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
  } catch (err) {
    throw new Error(`Failed to parse package.json: ${String(err)}`)
  }

  const id = pluginId ?? pkg.name ?? path.basename(pluginPath)

  if (_loaded.has(id)) {
    log.warn(`Plugin ${id} is already loaded, unloading previous instance`)
    await unloadPlugin(id)
  }

  const name = pkg.name ?? id
  const version = pkg.version ?? '0.0.0'

  log.info(`Loading plugin: ${id} (${name}@${version})`)

  // 3. 入口文件
  const entryFile = resolveEntryFile(pluginPath, pkg.main ?? 'index.js')

  // 4. 注册 veto 虚拟模块 —— 这是整件事的核心
  //    Module._load 拦截在 module-injector.ts 中，import 时生效
  const vetoApi = createVetoApi(id, pluginPath)
  registerPluginApi(pluginPath, vetoApi as unknown as Record<string, unknown>)

  const record: LoadedPlugin = {
    id,
    name,
    version,
    extensionPath: pluginPath,
    state: 'loading',
    startedAt: Date.now(),
    vetoApi
  }

  try {
    // 5. 加载插件模块 —— import "veto" 在此步骤中被拦截注入
    const entryUrl = pathToFileURL(entryFile).href
    const mod: PluginModule = await import(entryUrl)

    record.module = mod
    record.deactivate = mod.deactivate

    if (typeof mod.activate !== 'function') {
      throw new Error(`Plugin "${id}" does not export an activate function`)
    }

    // 6. activate(context)
    const context = createPluginContext({
      pluginId: id,
      extensionPath: pluginPath,
      metadata: pkg.veto ?? {}
    })

    await mod.activate(context)

    record.state = 'active'
    _loaded.set(id, record)
    log.info(`Plugin activated: ${id}`)
  } catch (err) {
    record.state = 'error'
    unregisterPluginApi(pluginPath)
    log.error(`Failed to load plugin ${id}:`, err)
    throw err
  }

  return record
}

// ═══════════════════════════════════════════════════════════════════════════════
// unloadPlugin / unloadAll
// ═══════════════════════════════════════════════════════════════════════════════

export async function unloadPlugin(pluginId: string): Promise<void> {
  const record = _loaded.get(pluginId)
  if (!record) {
    log.warn(`Plugin ${pluginId} is not loaded`)
    return
  }

  log.info(`Deactivating plugin: ${pluginId}`)

  try {
    if (record.deactivate) {
      await record.deactivate()
    }
  } catch (err) {
    log.error(`Error during deactivate of ${pluginId}:`, err)
  } finally {
    unregisterPluginApi(record.extensionPath)
    record.state = 'inactive'
    _loaded.delete(pluginId)
    log.info(`Plugin deactivated: ${pluginId}`)
  }
}

export async function unloadAll(): Promise<void> {
  const ids = Array.from(_loaded.keys())
  log.info(`Unloading ${ids.length} plugin(s)...`)
  const results = await Promise.allSettled(ids.map((id) => unloadPlugin(id)))
  for (let i = 0; i < ids.length; i++) {
    if (results[i].status === 'rejected') {
      log.error(`Failed to unload ${ids[i]}:`, (results[i] as PromiseRejectedResult).reason)
    }
  }
  log.info('All plugins unloaded')
}

// ═══════════════════════════════════════════════════════════════════════════════
// 查询
// ═══════════════════════════════════════════════════════════════════════════════

export function getLoadedPlugins(): ReadonlyArray<{
  id: string
  name: string
  version: string
  state: string
  startedAt: number
}> {
  return Array.from(_loaded.values()).map((p) => ({
    id: p.id,
    name: p.name,
    version: p.version,
    state: p.state,
    startedAt: p.startedAt
  }))
}

export function getPluginState(pluginId: string): string | null {
  return _loaded.get(pluginId)?.state ?? null
}

export function loadedCount(): number {
  return _loaded.size
}

// ═══════════════════════════════════════════════════════════════════════════════
// 入口文件解析
// ═══════════════════════════════════════════════════════════════════════════════

function resolveEntryFile(pluginPath: string, main: string): string {
  const relative = main.startsWith('./') || main.startsWith('../') ? main : `./${main}`
  const absolute = path.join(pluginPath, relative)

  if (path.extname(absolute) && fs.existsSync(absolute)) {
    return absolute
  }

  for (const ext of ['.mjs', '.js', '.cjs']) {
    const candidate = absolute + ext
    if (fs.existsSync(candidate)) return candidate
  }

  if (fs.existsSync(absolute) && fs.statSync(absolute).isDirectory()) {
    for (const indexFile of ['index.mjs', 'index.js']) {
      const candidate = path.join(absolute, indexFile)
      if (fs.existsSync(candidate)) return candidate
    }
  }

  throw new Error(
    `Cannot resolve plugin entry: "${main}" in ${pluginPath}. ` +
      `Tried: ${absolute}[.mjs,.js,.cjs] and ${absolute}/index.[m]js`
  )
}
