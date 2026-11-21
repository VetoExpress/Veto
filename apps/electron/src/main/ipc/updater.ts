/**
 * ipc/updater.ts — 自动更新 IPC 处理器
 *
 * 提供 Electron autoUpdater 的控制接口：
 * 检查更新、下载、安装，以及版本查询。
 */

import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { createLogger, log as baseLog } from '../logger'

type UpdateFeedOptions = Parameters<typeof autoUpdater.setFeedURL>[0]
type UpdateSource = 'r2' | 'github'
type UpdateEventSender = (event: string, data: unknown) => void

interface PendingDownloadedUpdate {
  version: string
}

interface StartupUpdateStatus {
  installing: boolean
  version: string | null
  availableVersion: string | null
}

const R2_UPDATE_FEED_URL = 'https://download.miaoyww.top/veto/releases'
const UPDATE_CHECK_INTERVAL_MS = 120_000
const PENDING_UPDATE_FILE = 'pending-update.json'

const updateFeeds = {
  r2: { provider: 'generic', url: R2_UPDATE_FEED_URL },
  github: { provider: 'github', owner: 'Miaoyww', repo: 'Veto' }
} as const satisfies Record<UpdateSource, UpdateFeedOptions>

const log = createLogger('Updater')

let activeUpdateSource: UpdateSource | null = null
let sendUpdateEvent: UpdateEventSender | null = null
let updateOperation: Promise<unknown> = Promise.resolve()
let reportInteractiveEvents = false
let suppressAvailableEvent = false
let startupInstall: PendingDownloadedUpdate | null = null
let availableVersion: string | null = null
let startupUpdatePreparing = false
let backgroundCheckInProgress = false
let initialized = false

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

function sendToAllWindows(event: string, data: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    win.webContents.send('veto:event', { event, data })
  }
}

function pendingUpdatePath(): string {
  return join(app.getPath('userData'), PENDING_UPDATE_FILE)
}

function readPendingUpdate(): PendingDownloadedUpdate | null {
  try {
    const value = JSON.parse(readFileSync(pendingUpdatePath(), 'utf8')) as Partial<PendingDownloadedUpdate>
    if (typeof value.version !== 'string' || value.version.length === 0) {
      unlinkSync(pendingUpdatePath())
      return null
    }

    if (autoUpdater.currentVersion.compare(value.version) >= 0) {
      unlinkSync(pendingUpdatePath())
      return null
    }

    return { version: value.version }
  } catch {
    return null
  }
}

function writePendingUpdate(version: string): void {
  try {
    writeFileSync(pendingUpdatePath(), JSON.stringify({ version }), 'utf8')
  } catch (error) {
    log.warn('Failed to persist downloaded update state', error)
  }
}

function enqueueUpdateOperation<T>(
  interactive: boolean,
  operation: () => Promise<T>
): Promise<T> {
  const next = updateOperation.then(async () => {
    const previousInteractiveState = reportInteractiveEvents
    reportInteractiveEvents = interactive
    try {
      return await operation()
    } finally {
      reportInteractiveEvents = previousInteractiveState
    }
  })

  updateOperation = next.catch(() => undefined)
  return next
}

async function runBackgroundUpdateCheck(): Promise<void> {
  if (startupInstall || startupUpdatePreparing || backgroundCheckInProgress) return
  backgroundCheckInProgress = true

  try {
    await enqueueUpdateOperation(false, async () => {
      const result = await checkForUpdateWithFallback()
      if (!result?.isUpdateAvailable) return
      await downloadUpdateWithFallback()
    })
  } catch (error) {
    log.warn('Background update check or download failed silently', {
      errorType: error instanceof Error ? error.name : typeof error
    })
  } finally {
    backgroundCheckInProgress = false
  }
}

async function prepareStartupUpdate(): Promise<void> {
  const pendingUpdate = readPendingUpdate()
  if (!pendingUpdate) return
  startupUpdatePreparing = true

  try {
    await enqueueUpdateOperation(false, async () => {
      suppressAvailableEvent = true
      try {
        const result = await checkForUpdateWithFallback()
        if (!result?.isUpdateAvailable) {
          throw new Error('Downloaded update is no longer available')
        }

        await downloadUpdateWithFallback()
        startupInstall = {
          version: result.updateInfo.version
        }
      } finally {
        suppressAvailableEvent = false
      }
    })
    sendUpdateEvent?.('updater:installing-on-startup', startupInstall)
  } catch (error) {
    log.warn('Downloaded update could not be prepared for startup installation', {
      errorType: error instanceof Error ? error.name : typeof error
    })
  } finally {
    startupUpdatePreparing = false
  }
}

function getStartupUpdateStatus(): StartupUpdateStatus {
  return {
    installing: startupInstall !== null,
    version: startupInstall?.version ?? null,
    availableVersion
  }
}

async function withManualCheck<T>(operation: () => Promise<T>): Promise<T> {
  return enqueueUpdateOperation(true, operation)
}

export function registerUpdaterIpc(): void {
  ipcMain.handle('veto:updater:check', async () => {
    try {
      const result = await withManualCheck(checkForUpdateWithFallback)
      return { success: true, result }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('veto:updater:download', async () => {
    try {
      const result = await withManualCheck(downloadUpdateWithFallback)
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

  ipcMain.handle('veto:updater:get-startup-status', () => {
    return getStartupUpdateStatus()
  })
}

export function initializeUpdater(): void {
  if (initialized) return
  initialized = true

  sendUpdateEvent = sendToAllWindows
  autoUpdater.logger = baseLog
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('checking-for-update', () => {
    if (reportInteractiveEvents) sendUpdateEvent?.('updater:checking-for-update', {})
  })

  autoUpdater.on('update-available', (info) => {
    availableVersion = info.version
    if (!suppressAvailableEvent) sendUpdateEvent?.('updater:update-available', info)
  })

  autoUpdater.on('update-not-available', (info) => {
    availableVersion = null
    if (reportInteractiveEvents) sendUpdateEvent?.('updater:update-not-available', info)
  })

  autoUpdater.on('download-progress', (progress) => {
    if (!reportInteractiveEvents) return
    sendUpdateEvent?.('updater:download-progress', {
      bytesPerSecond: progress.bytesPerSecond,
      percent: Math.round(progress.percent),
      total: progress.total,
      transferred: progress.transferred
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    availableVersion = null
    writePendingUpdate(info.version)
    if (reportInteractiveEvents) sendUpdateEvent?.('updater:update-downloaded', info)
  })

  autoUpdater.on('error', (error) => {
    if (reportInteractiveEvents) {
      sendUpdateEvent?.('updater:error', { message: error.message })
    }
  })

  void prepareStartupUpdate().then(() => {
    if (!startupInstall) void runBackgroundUpdateCheck()
  })

  setInterval(() => {
    void runBackgroundUpdateCheck()
  }, UPDATE_CHECK_INTERVAL_MS)

  log.info(`Automatic update checks enabled with a ${UPDATE_CHECK_INTERVAL_MS / 1000}s interval`)
}
