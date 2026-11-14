/**
 * ipc/window.ts — 窗口控制 IPC 处理器
 *
 * 提供窗口最小化/最大化/关闭命令。
 * 由 Renderer 进程通过 preload 调用。
 */

import { ipcMain, BrowserWindow, WebContentsView, shell, type Session } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'path'
import { getAppUrl } from '../dev-server'
import { getLocale } from '../i18n'
import { createLogger } from '../logger'
import type { Locale } from '../../shared/i18n'

const log = createLogger('WindowIPC')

const TITLEBAR_HEIGHT = 48
const STATUSBAR_HEIGHT = 30
const CLOUD_PLATFORM_ORIGIN = 'https://platform.miaoyww.top'

type CloudPlatformState = {
  open: boolean
  canGoBack: boolean
  canGoForward: boolean
}

type CloudPlatformWheel = {
  x?: unknown
  y?: unknown
  deltaX?: unknown
  deltaY?: unknown
}

function finiteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

let cloudPlatformView: WebContentsView | null = null
let cloudPlatformWindow: BrowserWindow | null = null
let localeHeadersRegistered = false

function cloudPlatformPath(input?: unknown): string {
  if (typeof input !== 'string' || !input || input.length > 2048) return '/'
  try {
    const url = new URL(input, CLOUD_PLATFORM_ORIGIN)
    if (url.origin !== CLOUD_PLATFORM_ORIGIN) return '/'
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return '/'
  }
}

function cloudPlatformUrl(path?: unknown): string {
  const url = new URL(cloudPlatformPath(path), CLOUD_PLATFORM_ORIGIN)
  url.searchParams.set('from', 'app')
  url.searchParams.set('embedded', '1')
  url.searchParams.set('lang', getLocale())
  return url.toString()
}

function registerLocaleRequestHeaders(session: Session): void {
  if (localeHeadersRegistered) return
  localeHeadersRegistered = true
  session.webRequest.onBeforeSendHeaders(
    { urls: [`${CLOUD_PLATFORM_ORIGIN}/*`] },
    (details, callback) => {
      const locale = getLocale()
      details.requestHeaders['X-Veto-Locale'] = locale
      details.requestHeaders['Accept-Language'] = locale
      callback({ requestHeaders: details.requestHeaders })
    }
  )
}

export function notifyCloudPlatformLocale(locale: Locale): void {
  const contents = cloudPlatformView?.webContents
  if (!contents || contents.isDestroyed()) return
  try {
    contents.send('veto:i18n:locale-changed', locale)
  } catch (error) {
    log.warn('Failed to notify embedded cloud platform of language change', {
      errorType: error instanceof Error ? error.name : typeof error
    })
  }
}

function getCloudPlatformState(): CloudPlatformState {
  const contents = cloudPlatformView?.webContents
  return {
    open: !!contents,
    canGoBack: contents?.navigationHistory.canGoBack() ?? false,
    canGoForward: contents?.navigationHistory.canGoForward() ?? false
  }
}

function publishCloudPlatformState(): void {
  cloudPlatformWindow?.webContents.send('veto:cloud-platform:changed', getCloudPlatformState())
}

function updateCloudPlatformBounds(): void {
  if (!cloudPlatformView || !cloudPlatformWindow) return
  const { width, height } = cloudPlatformWindow.getContentBounds()
  cloudPlatformView.setBounds({
    x: 0,
    y: TITLEBAR_HEIGHT,
    width,
    height: Math.max(0, height - TITLEBAR_HEIGHT - STATUSBAR_HEIGHT)
  })
}

function closeCloudPlatform(): void {
  if (!cloudPlatformView) return
  const view = cloudPlatformView
  const win = cloudPlatformWindow
  cloudPlatformView = null
  win?.removeListener('resize', updateCloudPlatformBounds)
  win?.removeListener('closed', closeCloudPlatform)
  win?.contentView.removeChildView(view)
  view.webContents.close()
  publishCloudPlatformState()
  cloudPlatformWindow = null
}

function openCloudPlatform(win: BrowserWindow, path?: unknown): void {
  const targetUrl = cloudPlatformUrl(path)
  if (cloudPlatformView) {
    updateCloudPlatformBounds()
    cloudPlatformView.webContents.focus()
    if (cloudPlatformView.webContents.getURL() !== targetUrl) {
      void cloudPlatformView.webContents.loadURL(targetUrl).catch((error: unknown) => {
        log.error('Failed to navigate embedded cloud platform', {
          errorType: error instanceof Error ? error.name : typeof error,
          message: error instanceof Error ? error.message : String(error)
        })
      })
    }
    publishCloudPlatformState()
    return
  }

  cloudPlatformWindow = win
  const view = new WebContentsView({
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      spellcheck: false
    }
  })
  cloudPlatformView = view
  registerLocaleRequestHeaders(view.webContents.session)
  win.contentView.addChildView(view)
  win.on('resize', updateCloudPlatformBounds)
  win.on('closed', closeCloudPlatform)
  updateCloudPlatformBounds()

  view.webContents.on('will-navigate', (event, navigationUrl) => {
    const target = new URL(navigationUrl)
    if (target.origin !== 'https://platform.miaoyww.top') {
      event.preventDefault()
      void shell.openExternal(navigationUrl)
    }
  })
  view.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  const publish = (): void => publishCloudPlatformState()
  view.webContents.on('did-navigate', publish)
  view.webContents.on('did-navigate-in-page', publish)
  view.webContents.on('did-finish-load', publish)
  void view.webContents.loadURL(targetUrl).catch((error: unknown) => {
    log.error('Failed to load embedded cloud platform', {
      errorType: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error)
    })
    closeCloudPlatform()
  })
  publishCloudPlatformState()
}

export function registerWindowIpc(): void {
  ipcMain.on('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.on('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win?.isMaximized()) win.unmaximize()
    else win?.maximize()
  })

  ipcMain.on('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.on('window:return-to-app', (event) => {
    // Reload the app in the same native window, using the same entry as startup.
    closeCloudPlatform()
    BrowserWindow.fromWebContents(event.sender)?.loadURL(getAppUrl(is.dev))
  })

  ipcMain.on('cloud-platform:open', (event, path) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) openCloudPlatform(win, path)
  })

  ipcMain.on('cloud-platform:close', (event) => {
    if (BrowserWindow.fromWebContents(event.sender) === cloudPlatformWindow) closeCloudPlatform()
  })

  ipcMain.on('cloud-platform:set-visible', (event, visible) => {
    if (BrowserWindow.fromWebContents(event.sender) !== cloudPlatformWindow) return
    cloudPlatformView?.setVisible(visible === true)
    if (visible === true) cloudPlatformView?.webContents.focus()
  })

  ipcMain.on('cloud-platform:wheel', (event, input?: CloudPlatformWheel) => {
    if (BrowserWindow.fromWebContents(event.sender) !== cloudPlatformWindow) return
    if (!cloudPlatformView || !input) return
    const bounds = cloudPlatformView.getBounds()
    const x = Math.min(Math.max(finiteNumber(input.x) - bounds.x, 0), Math.max(0, bounds.width - 1))
    const y = Math.min(
      Math.max(finiteNumber(input.y) - bounds.y, 0),
      Math.max(0, bounds.height - 1)
    )
    const deltaX = finiteNumber(input.deltaX)
    const deltaY = finiteNumber(input.deltaY)
    cloudPlatformView.webContents.sendInputEvent({
      type: 'mouseWheel',
      x,
      y,
      deltaX,
      deltaY,
      wheelTicksX: deltaX / 100,
      wheelTicksY: deltaY / 100,
      canScroll: true,
      hasPreciseScrollingDeltas: true
    })
  })

  ipcMain.on('cloud-platform:back', (event) => {
    if (BrowserWindow.fromWebContents(event.sender) !== cloudPlatformWindow) return
    const contents = cloudPlatformView?.webContents
    if (contents?.navigationHistory.canGoBack()) contents.navigationHistory.goBack()
  })

  ipcMain.on('cloud-platform:forward', (event) => {
    if (BrowserWindow.fromWebContents(event.sender) !== cloudPlatformWindow) return
    const contents = cloudPlatformView?.webContents
    if (contents?.navigationHistory.canGoForward()) contents.navigationHistory.goForward()
  })

  ipcMain.on('cloud-platform:state', (event) => {
    if (BrowserWindow.fromWebContents(event.sender) === cloudPlatformWindow)
      publishCloudPlatformState()
  })
}
