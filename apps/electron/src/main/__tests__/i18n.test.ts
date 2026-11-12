import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'

const state = vi.hoisted(() => ({
  preferences: null as Record<string, unknown> | null,
  languages: ['en-GB'],
  appLocale: 'en-US',
  windows: [] as ReturnType<typeof makeWindow>[],
  handlers: new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown>(),
  save: vi.fn(),
  load: vi.fn(),
  notifyCloudPlatform: vi.fn(),
  log: { warn: vi.fn(), error: vi.fn() },
  dev: true
}))

vi.mock('electron', () => ({
  app: {
    getPreferredSystemLanguages: () => state.languages,
    getLocale: () => state.appLocale
  },
  BrowserWindow: { getAllWindows: () => state.windows },
  ipcMain: {
    handle: (
      channel: string,
      handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
    ) => state.handlers.set(channel, handler)
  }
}))
vi.mock('@electron-toolkit/utils', () => ({
  is: {
    get dev() {
      return state.dev
    }
  }
}))
vi.mock('../logger', () => ({ createLogger: () => state.log }))
vi.mock('../ipc/window', () => ({
  notifyCloudPlatformLocale: state.notifyCloudPlatform
}))
vi.mock('../data/store', () => ({
  loadStore: (domain: string) => state.load(domain),
  saveStore: (domain: string, value: Record<string, unknown>) => state.save(domain, value),
  deleteStore: vi.fn(),
  migrateFromLocalStorage: vi.fn()
}))

function event(origin: string, subframe = false): IpcMainInvokeEvent {
  const mainFrame = { origin }
  return {
    senderFrame: subframe ? { origin } : mainFrame,
    sender: { mainFrame }
  } as unknown as IpcMainInvokeEvent
}

function makeWindow(origin = 'veto://app', destroyed = false) {
  return {
    id: state.windows.length + 1,
    isDestroyed: () => destroyed,
    setTitle: vi.fn(),
    on: vi.fn(),
    webContents: { mainFrame: { origin }, send: vi.fn() }
  }
}

async function start() {
  const desktop = await import('../desktop-i18n')
  const i18n = await import('../i18n')
  desktop.initializeDesktopI18n()
  const ipc = await import('../ipc/i18n')
  ipc.registerI18nIpc()
  return { ...desktop, ...i18n }
}

describe('desktop language authority', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    state.preferences = null
    state.languages = ['en-GB']
    state.appLocale = 'en-US'
    state.windows = []
    state.handlers.clear()
    state.dev = true
    state.load.mockImplementation(() => state.preferences)
    state.save.mockImplementation((_domain, value) => {
      state.preferences = structuredClone(value)
    })
  })
  afterEach(() => vi.unstubAllEnvs())

  it('initializes from system language before any renderer and restores preference on restart', async () => {
    const first = await start()
    expect(first.getLocale()).toBe('en-US')
    expect(state.save).toHaveBeenCalledWith('preferences', { locale: 'en-US' })
    first.setDesktopLocale('zh-CN')
    state.languages = ['en-US']
    vi.resetModules()
    const restarted = await start()
    expect(restarted.getLocale()).toBe('zh-CN')
  }, 60_000)

  it('uses the first supported system language and preserves unrelated preferences', async () => {
    state.languages = ['fr-FR', 'zh-Hans-CN', 'en-US']
    state.preferences = { locale: 'unsupported', other: true }
    const desktop = await start()
    expect(desktop.getLocale()).toBe('zh-CN')
    desktop.setDesktopLocale('en-US')
    expect(state.preferences).toEqual({ locale: 'en-US', other: true })
    expect(state.log.warn).toHaveBeenCalled()
  }, 15_000)

  it('rejects foreign origins, subframes, missing frames and invalid locales without mutation', async () => {
    const desktop = await start()
    const set = state.handlers.get('veto:i18n:set-locale')!
    const get = state.handlers.get('veto:i18n:get-locale')!
    state.save.mockClear()
    for (const source of [
      event('https://evil.test'),
      event('https://platform.miaoyww.top.evil.test'),
      event('veto://app', true),
      { senderFrame: null } as IpcMainInvokeEvent
    ]) {
      expect(() => set(source, 'zh-CN')).toThrow(
        'This page cannot access desktop language settings.'
      )
      expect(() => get(source)).toThrow('This page cannot access desktop language settings.')
    }
    for (const value of [null, {}, 'en', 'EN-us', 'fr-FR']) {
      expect(() => set(event('veto://app'), value)).toThrow(
        'Unsupported language. Please choose Chinese or English.'
      )
    }
    expect(desktop.getLocale()).toBe('en-US')
    expect(state.save).not.toHaveBeenCalled()
    expect(get(event('veto://app'))).toBe('en-US')
    expect(set(event('https://platform.miaoyww.top'), 'zh-CN')).toBeUndefined()
    expect(desktop.getLocale()).toBe('zh-CN')
  })

  it('allows configured development origins only in development', async () => {
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://127.0.0.1:5174')
    await start()
    const set = state.handlers.get('veto:i18n:set-locale')!
    set(event('http://127.0.0.1:5174'), 'zh-CN')
    state.dev = false
    expect(() => set(event('http://127.0.0.1:5174'), 'en-US')).toThrow()
    expect(() => set(event('http://localhost:5173'), 'en-US')).toThrow()
  })

  it('prevents generic store IPC from bypassing preference validation and origin checks', async () => {
    await start()
    const { registerStoreIpc } = await import('../ipc/store')
    registerStoreIpc()
    state.load.mockClear()
    state.save.mockClear()
    for (const operation of ['load', 'save', 'delete', 'migrate']) {
      const handler = state.handlers.get(`veto:store:${operation}`)!
      for (const domain of ['preferences', ['preferences'], null, {}]) {
        expect(() => handler(event('https://evil.test'), domain, { locale: 'zh-CN' })).toThrow(
          'This page cannot access desktop language settings.'
        )
      }
    }
    expect(state.load).not.toHaveBeenCalled()
    expect(state.save).not.toHaveBeenCalled()
  })

  it('notifies every live trusted window, updates titles, and isolates closed or failing windows', async () => {
    const desktop = await start()
    const main = makeWindow()
    const display = makeWindow()
    const platform = makeWindow('https://platform.miaoyww.top')
    const failing = makeWindow()
    failing.webContents.send.mockImplementation(() => {
      throw new Error('window closed')
    })
    const foreign = makeWindow('https://evil.test')
    const closed = makeWindow('veto://app', true)
    state.windows = [failing, main, display, platform, foreign, closed]
    desktop.bindWindowTitle(display as unknown as BrowserWindow, 'electron_window_display_title')
    desktop.setDesktopLocale('zh-CN')
    expect(state.notifyCloudPlatform).toHaveBeenCalledWith('zh-CN')
    for (const window of [main, display, platform]) {
      expect(window.webContents.send).toHaveBeenCalledWith('veto:i18n:locale-changed', 'zh-CN')
    }
    expect(display.setTitle).toHaveBeenLastCalledWith('VETO 大会 - 显示窗口')
    desktop.setDesktopLocale('en-US')
    expect(state.notifyCloudPlatform).toHaveBeenLastCalledWith('en-US')
    expect(display.setTitle).toHaveBeenLastCalledWith('VETO Conference - Display Window')
    expect(foreign.webContents.send).not.toHaveBeenCalled()
    expect(closed.webContents.send).not.toHaveBeenCalled()
    expect(state.log.warn).toHaveBeenCalled()
    const preventDefault = vi.fn()
    display.on.mock.calls.find(([name]) => name === 'page-title-updated')![1]({ preventDefault })
    expect(preventDefault).toHaveBeenCalledOnce()
  })

  it('keeps language active and notifies windows when persistence fails; retrying the same locale saves again', async () => {
    const desktop = await start()
    const window = makeWindow()
    state.windows = [window]
    state.save.mockImplementationOnce(() => {
      throw new Error('disk full')
    })
    desktop.setDesktopLocale('zh-CN')
    expect(desktop.getLocale()).toBe('zh-CN')
    expect(window.webContents.send).toHaveBeenCalledWith('veto:i18n:locale-changed', 'zh-CN')
    expect(state.log.error).toHaveBeenCalledWith(
      expect.any(String),
      { locale: 'zh-CN' },
      expect.any(Error)
    )
    desktop.setDesktopLocale('zh-CN')
    expect(state.preferences?.locale).toBe('zh-CN')
    expect(window.webContents.send).toHaveBeenCalledOnce()
  })

  it('recovers from unreadable preferences and subscriber errors without stopping other subscribers', async () => {
    state.load.mockImplementation(() => {
      throw new Error('unreadable preferences')
    })
    const desktop = await start()
    expect(desktop.getLocale()).toBe('en-US')
    desktop.onLocaleChanged(() => {
      throw new Error('subscriber failed')
    })
    const listener = vi.fn()
    const unsubscribe = desktop.onLocaleChanged(listener)
    desktop.setDesktopLocale('zh-CN')
    expect(listener).toHaveBeenCalledWith('zh-CN')
    unsubscribe()
    desktop.setDesktopLocale('en-US')
    expect(listener).toHaveBeenCalledOnce()
  })
})
