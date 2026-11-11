import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { handlers, runtime, window } = vi.hoisted(() => ({
  handlers: new Map<string, (event: { sender: unknown }) => void>(),
  runtime: { dev: true },
  window: { loadURL: vi.fn().mockResolvedValue(undefined) }
}))

vi.mock('electron', () => ({
  ipcMain: {
    on: (channel: string, handler: (event: { sender: unknown }) => void) =>
      handlers.set(channel, handler)
  },
  BrowserWindow: { fromWebContents: vi.fn(() => window) }
}))

vi.mock('@electron-toolkit/utils', () => ({ is: runtime }))

import { BrowserWindow } from 'electron'
import { registerWindowIpc } from '../ipc/window'

describe('从云平台返回桌面应用', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    handlers.clear()
    registerWindowIpc()
  })

  afterEach(() => {
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
})
