import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { handlers, runtime, window, view } = vi.hoisted(() => {
  const view = {
    options: null as Record<string, unknown> | null,
    webContents: {
      getURL: vi.fn(() => ''),
      loadURL: vi.fn().mockResolvedValue(undefined),
      focus: vi.fn(),
      close: vi.fn(),
      sendInputEvent: vi.fn(),
      on: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      navigationHistory: {
        canGoBack: vi.fn(() => false),
        canGoForward: vi.fn(() => false)
      },
      session: {
        webRequest: { onBeforeSendHeaders: vi.fn() }
      }
    },
    setBounds: vi.fn(),
    setVisible: vi.fn(),
    getBounds: vi.fn(() => ({ x: 0, y: 48, width: 1200, height: 642 }))
  }
  return {
    handlers: new Map<string, (event: { sender: unknown }, ...args: unknown[]) => void>(),
    runtime: { dev: true },
    window: {
      loadURL: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      removeListener: vi.fn(),
      getContentBounds: vi.fn(() => ({ width: 1200, height: 720 })),
      contentView: {
        addChildView: vi.fn(),
        removeChildView: vi.fn()
      },
      webContents: { send: vi.fn() }
    },
    view
  }
})

vi.mock('electron', () => ({
  ipcMain: {
    on: (channel: string, handler: (event: { sender: unknown }, ...args: unknown[]) => void) =>
      handlers.set(channel, handler)
  },
  BrowserWindow: { fromWebContents: vi.fn(() => window) },
  WebContentsView: class {
    constructor(options: Record<string, unknown>) {
      view.options = options
      return view as unknown as object
    }
  }
}))

vi.mock('@electron-toolkit/utils', () => ({ is: runtime }))
vi.mock('../i18n', () => ({ getLocale: () => 'zh-CN' }))

import { BrowserWindow } from 'electron'
import { registerWindowIpc } from '../ipc/window'

describe('从云平台返回桌面应用', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    handlers.clear()
    view.options = null
    registerWindowIpc()
  })

  afterEach(() => {
    handlers.get('cloud-platform:close')?.({ sender: { id: 'main-window' } })
    vi.unstubAllEnvs()
  })

  it.each([
    [true, 'http://127.0.0.1:5173/'],
    [false, 'veto://app/']
  ])('开发模式 %s 使用本地入口 %s', (dev, url) => {
    runtime.dev = dev
    const sender = { id: 'platform-window' }
    handlers.get('window:return-to-app')!({ sender })
    expect(BrowserWindow.fromWebContents).toHaveBeenCalledWith(sender)
    expect(window.loadURL).toHaveBeenCalledExactlyOnceWith(url)
  })

  it('uses the configured development server URL', () => {
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://127.0.0.1:5174')
    runtime.dev = true
    const sender = { id: 'platform-window' }
    handlers.get('window:return-to-app')!({ sender })
    expect(window.loadURL).toHaveBeenCalledExactlyOnceWith('http://127.0.0.1:5174/')
  })

  it('opens the cloud platform in a sandbox-compatible embedded view at the requested path', () => {
    const sender = { id: 'main-window' }
    handlers.get('cloud-platform:open')!({ sender }, '/conferences/abc?tab=seats')

    expect(view.webContents.loadURL).toHaveBeenCalledExactlyOnceWith(
      'https://platform.miaoyww.top/conferences/abc?tab=seats&from=app&embedded=1&lang=zh-CN'
    )
    expect(view.setBounds).toHaveBeenCalledWith({
      x: 0,
      y: 48,
      width: 1200,
      height: 642
    })
  })

  it('keeps the shared preload enabled in the embedded cloud platform', () => {
    const sender = { id: 'main-window' }
    handlers.get('cloud-platform:open')!({ sender })
    expect(view.options?.webPreferences).toMatchObject({
      preload: expect.stringContaining('preload'),
      sandbox: false
    })
  })

  it('falls back to the platform root for foreign paths', () => {
    const sender = { id: 'main-window' }
    handlers.get('cloud-platform:open')!({ sender }, 'https://evil.test/path')
    expect(view.webContents.loadURL).toHaveBeenLastCalledWith(
      'https://platform.miaoyww.top/?from=app&embedded=1&lang=zh-CN'
    )
  })

  it('hides the native view while a renderer overlay is open', () => {
    const sender = { id: 'main-window' }
    handlers.get('cloud-platform:open')!({ sender })
    handlers.get('cloud-platform:set-visible')!({ sender }, false)
    expect(view.setVisible).toHaveBeenLastCalledWith(false)
    handlers.get('cloud-platform:set-visible')!({ sender }, true)
    expect(view.setVisible).toHaveBeenLastCalledWith(true)
    expect(view.webContents.focus).toHaveBeenCalled()
  })

  it('forwards renderer wheel coordinates into the embedded view', () => {
    const sender = { id: 'main-window' }
    handlers.get('cloud-platform:open')!({ sender })
    handlers.get('cloud-platform:wheel')!(
      { sender },
      { x: 500, y: 200, deltaX: 0, deltaY: 120 }
    )
    expect(view.webContents.sendInputEvent).toHaveBeenCalledWith({
      type: 'mouseWheel',
      x: 500,
      y: 152,
      deltaX: 0,
      deltaY: 120,
      wheelTicksX: 0,
      wheelTicksY: 1.2,
      canScroll: true,
      hasPreciseScrollingDeltas: true
    })
  })
})
