/**
 * ipc/plugins.ts — 插件管理 IPC 处理器
 *
 * 提供插件的列表/详情/安装/卸载/启用禁用等操作。
 * 仅管理磁盘上的插件文件，不涉及运行时进程管理。
 */

import { ipcMain, BrowserWindow } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import { getPluginsDir, type PluginInstance } from '../plugin-discovery'
import { enablePlugin, disablePlugin } from '../plugin-store'
import { createLogger } from '../logger'
import { t } from '../i18n'

const log = createLogger('IpcPlugins')

export function registerPluginsIpc(
  pluginInstances: PluginInstance[],
  refreshPlugins: () => void
): void {
  // ── 插件列表 ──────────────────────────────────────────────────
  ipcMain.handle('veto:plugins:list', () => {
    return pluginInstances.map((p) => ({
      id: p.manifest.id,
      name: p.manifest.name,
      version: p.manifest.version,
      author: p.manifest.author,
      type: p.manifest.type,
      description: p.manifest.description,
      disabled: p.disabled,
      incompatible: p.incompatible,
      dependencies: p.manifest.dependencies,
      injects:
        p.manifest.type === 'faction' || p.manifest.type === 'campaign'
          ? p.manifest.injects
          : undefined,
      hasDefinitions: !!p.path.definitions,
      hasI18n: !!p.path.i18n,
      hasAssets: !!p.path.assets,
      hasSeats: !!p.path.seats,
      hasService: !!p.path.service
    }))
  })

  // ── 插件详情 ──────────────────────────────────────────────────
  ipcMain.handle('veto:plugins:get', (_event, pluginId: string) => {
    const plugin = pluginInstances.find((p) => p.manifest.id === pluginId)
    if (!plugin) return null

    const type = plugin.manifest.type
    const needsDefinitions = type === 'faction' || type === 'campaign'

    // 读取 definitions
    let definitions: string | null = null
    if (needsDefinitions && plugin.path.definitions) {
      try {
        if (plugin.path.definitionsIsDir) {
          const files = fs
            .readdirSync(plugin.path.definitions)
            .filter((f) => f.endsWith('.json'))
            .sort()
          const merged: Record<string, unknown> = {}
          for (const file of files) {
            const content = fs.readFileSync(join(plugin.path.definitions!, file), 'utf-8')
            const parsed = JSON.parse(content)
            for (const [key, val] of Object.entries(parsed)) {
              if (Array.isArray(val) && Array.isArray(merged[key])) {
                ;(merged[key] as unknown[]).push(...(val as unknown[]))
              } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
                merged[key] = { ...((merged[key] as object) ?? {}), ...(val as object) }
              } else {
                merged[key] = val
              }
            }
          }
          definitions = JSON.stringify(merged)
        } else {
          definitions = fs.readFileSync(plugin.path.definitions, 'utf-8')
        }
      } catch (err) {
        log.error(`Failed to read definitions for ${pluginId}:`, err)
      }
    }

    // 读取 i18n
    const i18n: Record<string, string> = {}
    if (needsDefinitions && plugin.path.i18n && fs.existsSync(plugin.path.i18n)) {
      try {
        for (const file of fs.readdirSync(plugin.path.i18n)) {
          if (file.endsWith('.json')) {
            const locale = file.replace(/\.json$/i, '')
            i18n[locale] = fs.readFileSync(join(plugin.path.i18n!, file), 'utf-8')
          }
        }
      } catch {
        /* ignore */
      }
    }

    // 读取战役资源
    const campaignFiles: Record<string, string> = {}
    if (type === 'campaign') {
      for (const key of ['mapConfig', 'deployments', 'facilities', 'events'] as const) {
        const filePath = plugin.path[key]
        if (filePath && fs.existsSync(filePath)) {
          try {
            campaignFiles[key] = fs.readFileSync(filePath, 'utf-8')
          } catch {
            /* ignore */
          }
        }
      }
    }

    // 读取席位预设
    let seats: string | null = null
    if (plugin.path.seats && fs.existsSync(plugin.path.seats)) {
      try {
        seats = fs.readFileSync(plugin.path.seats, 'utf-8')
      } catch {
        /* ignore */
      }
    }

    return {
      ...plugin,
      definitions,
      i18n,
      manifest: plugin.manifest,
      campaignFiles,
      seats,
      hasService: !!plugin.path.service
    }
  })

  // ── 插件目录文件列表 ──────────────────────────────────────────
  ipcMain.handle('veto:plugins:list-files', (_event, pluginId: string, subDir: string) => {
    const plugin = pluginInstances.find((p) => p.manifest.id === pluginId)
    if (!plugin) return []

    try {
      const dirPath = join(plugin.path.plugin, subDir)
      if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) return []
      return fs
        .readdirSync(dirPath)
        .filter((f) => f.endsWith('.json'))
        .sort()
    } catch {
      return []
    }
  })

  // ── 批量读取插件文件 ──────────────────────────────────────────
  ipcMain.handle('veto:plugins:read-files', (_event, pluginId: string, filePaths: string[]) => {
    const plugin = pluginInstances.find((p) => p.manifest.id === pluginId)
    if (!plugin) return {}

    const result: Record<string, string> = {}
    for (const filePath of filePaths) {
      try {
        const fullPath = join(plugin.path.plugin, filePath)
        if (!fullPath.startsWith(plugin.path.plugin)) {
          log.warn(`Path traversal attempt: ${filePath}`)
          continue
        }
        if (fs.existsSync(fullPath)) {
          result[filePath] = fs.readFileSync(fullPath, 'utf-8')
        }
      } catch {
        /* skip */
      }
    }
    return result
  })

  // ── 插件启用/禁用 ─────────────────────────────────────────────
  ipcMain.handle('veto:plugins:toggle', async (_event, pluginId: string, enabled: boolean) => {
    if (enabled) {
      enablePlugin(pluginId)
    } else {
      disablePlugin(pluginId)
    }
    refreshPlugins()
    return { success: true }
  })

  // ── 插件卸载 ──────────────────────────────────────────────────
  ipcMain.handle('veto:plugins:uninstall', async (_event, pluginId: string) => {
    const plugin = pluginInstances.find((p) => p.manifest.id === pluginId)
    if (!plugin) {
      return { success: false, error: t('electron_plugin_not_found') }
    }

    try {
      fs.rmSync(plugin.path.plugin, { recursive: true, force: true })
      refreshPlugins()

      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('veto:event', { event: 'plugins:changed', data: {} })
      }

      return { success: true }
    } catch (err) {
      log.error(`Failed to uninstall plugin ${pluginId}:`, err)
      return { success: false, error: String(err) }
    }
  })

  // ── 插件安装 ──────────────────────────────────────────────────
  ipcMain.handle(
    'veto:plugins:install',
    async (
      _event,
      payload: {
        manifest: Record<string, unknown>
        definitions: string | null
        i18n: Record<string, string>
        assets: Array<{ path: string; data: string; mimeType: string }>
        seats?: string | null
      }
    ) => {
      const pluginId = payload.manifest.id as string
      if (!pluginId) return { success: false, error: t('electron_plugin_id_missing') }

      try {
        const pluginsDir = getPluginsDir()
        const pluginDir = join(pluginsDir, pluginId)

        if (fs.existsSync(pluginDir)) {
          fs.rmSync(pluginDir, { recursive: true, force: true })
        }
        fs.mkdirSync(pluginDir, { recursive: true })

        // 写入 manifest.json
        fs.writeFileSync(
          join(pluginDir, 'manifest.json'),
          JSON.stringify(payload.manifest, null, 2),
          'utf-8'
        )

        // 写入 definitions.json
        if (payload.definitions) {
          fs.writeFileSync(join(pluginDir, 'definitions.json'), payload.definitions, 'utf-8')
        }

        // 写入 seats.json
        if (payload.seats) {
          fs.writeFileSync(join(pluginDir, 'seats.json'), payload.seats, 'utf-8')
        }

        // 写入 i18n 文件
        if (Object.keys(payload.i18n).length > 0) {
          const i18nDir = join(pluginDir, 'i18n')
          fs.mkdirSync(i18nDir, { recursive: true })
          for (const [locale, content] of Object.entries(payload.i18n)) {
            fs.writeFileSync(join(i18nDir, `${locale}.json`), content, 'utf-8')
          }
        }

        // 写入资源文件
        if (payload.assets.length > 0) {
          const assetsDir = join(pluginDir, 'assets')
          fs.mkdirSync(assetsDir, { recursive: true })
          for (const asset of payload.assets) {
            const assetFullPath = join(assetsDir, asset.path)
            fs.mkdirSync(join(assetFullPath, '..'), { recursive: true })
            fs.writeFileSync(assetFullPath, Buffer.from(asset.data, 'base64'))
          }
        }

        refreshPlugins()

        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send('veto:event', {
            event: 'plugins:changed',
            data: { pluginId }
          })
        }

        log.info(`Plugin installed: ${pluginId}`)
        return { success: true }
      } catch (err) {
        log.error(`Failed to install plugin ${pluginId}:`, err)
        return { success: false, error: String(err) }
      }
    }
  )
}
