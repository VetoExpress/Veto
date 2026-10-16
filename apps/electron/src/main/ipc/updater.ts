/**
 * ipc/updater.ts — 自动更新 IPC 处理器
 *
 * 提供 Electron autoUpdater 的控制接口：
 * 检查更新、下载、安装，以及版本查询。
 */

import { ipcMain, app } from 'electron'
import { autoUpdater } from 'electron-updater'

type UpdateFeedOptions = Parameters<typeof autoUpdater.setFeedURL>[0]
type UpdateSource = 'r2' | 'github'

const R2_UPDATE_FEED_URL = 'https://download.miaoyww.top/veto/releases'

const updateFeeds = {
  r2: { provider: 'generic', url: R2_UPDATE_FEED_URL },
  github: { provider: 'github', owner: 'Miaoyww', repo: 'Veto' }
} as const satisfies Record<UpdateSource, UpdateFeedOptions>

let activeUpdateSource: UpdateSource | null = null

function useUpdateSource(source: UpdateSource): void {
  if (activeUpdateSource === source) return

  autoUpdater.setFeedURL(updateFeeds[source])
  activeUpdateSource = source
}

async function checkForUpdateWithFallback(): Promise<
  Awaited<ReturnType<typeof autoUpdater.checkForUpdates>>
> {
  useUpdateSource('r2')

  try {
    return await autoUpdater.checkForUpdates()
  } catch {
    useUpdateSource('github')
    return await autoUpdater.checkForUpdates()
  }
}

async function downloadUpdateWithFallback(): Promise<
  Awaited<ReturnType<typeof autoUpdater.downloadUpdate>>
> {
  try {
    return await autoUpdater.downloadUpdate()
  } catch (error) {
    if (activeUpdateSource !== 'r2') throw error

    useUpdateSource('github')
    await autoUpdater.checkForUpdates()
    return await autoUpdater.downloadUpdate()
  }
}

export function registerUpdaterIpc(): void {
  ipcMain.handle('veto:updater:check', async () => {
    try {
      const result = await checkForUpdateWithFallback()
      return { success: true, result }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('veto:updater:download', async () => {
    try {
      const result = await downloadUpdateWithFallback()
      return { success: true, result }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('veto:updater:quit-and-install', () => {
    setImmediate(() => {
      autoUpdater.quitAndInstall()
    })
    return { success: true }
  })

  ipcMain.handle('veto:updater:get-version', () => {
    return app.getVersion()
  })
}
