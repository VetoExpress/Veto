/**
 * ipc/assets.ts — 插件资源文件 IPC 处理器
 *
 * 读取插件 assets/ 目录下的图片/字体等静态资源，
 * 返回 base64 编码的数据 URL。
 */

import { ipcMain } from 'electron'
import { join, extname } from 'path'
import * as fs from 'fs'
import type { PluginInstance } from '../plugin-discovery'
import { createLogger } from '../logger'

const log = createLogger('IpcAssets')

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml'
}

export function registerAssetsIpc(pluginInstances: PluginInstance[]): void {
  ipcMain.handle('veto:assets:get', (_event, pluginId: string, assetPath: string) => {
    const plugin = pluginInstances.find((p) => p.manifest.id === pluginId)
    if (!plugin || !plugin.path.assets) return null

    try {
      const fullPath = join(plugin.path.assets, assetPath)

      // 安全检查：确保路径在插件 assets 目录内
      if (!fullPath.startsWith(plugin.path.assets)) {
        log.warn(`Asset path traversal attempt: ${assetPath}`)
        return null
      }

      if (!fs.existsSync(fullPath)) return null

      const buffer = fs.readFileSync(fullPath)
      const ext = extname(fullPath).toLowerCase()

      return {
        data: buffer.toString('base64'),
        mimeType: MIME_MAP[ext] ?? 'application/octet-stream'
      }
    } catch {
      return null
    }
  })
}
