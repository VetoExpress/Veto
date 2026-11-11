import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VetoAPI } from '../../preload/index.d'

const bridge = vi.hoisted(() => ({
  exposed: new Map<string, unknown>(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn()
}))

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (name: string, value: unknown) => bridge.exposed.set(name, value)
  },
  ipcRenderer: bridge
}))
vi.mock('@electron-toolkit/preload', () => ({ electronAPI: {} }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('preload language bridge', () => {
  it('exposes typed language operations and removes only its own wrapped listener', async () => {
    vi.stubGlobal('process', { ...process, contextIsolated: true })
    await import('../../preload/index')
    const api = (bridge.exposed.get('veto') as VetoAPI).i18n
    bridge.invoke.mockResolvedValueOnce('en-US')
    expect(await api.getLocale()).toBe('en-US')
    expect(bridge.invoke).toHaveBeenLastCalledWith('veto:i18n:get-locale')
    bridge.invoke.mockResolvedValueOnce(undefined)
    expect(await api.setLocale('zh-CN')).toBeUndefined()
    expect(bridge.invoke).toHaveBeenLastCalledWith('veto:i18n:set-locale', 'zh-CN')
    const callback = vi.fn()
    const unsubscribe = api.onLocaleChanged(callback)
    const otherCallback = vi.fn()
    api.onLocaleChanged(otherCallback)
    const [channel, listener] = bridge.on.mock.calls[0]
    expect(channel).toBe('veto:i18n:locale-changed')
    listener({ sender: 'private Electron event' }, 'en-US')
    expect(callback).toHaveBeenCalledExactlyOnceWith('en-US')
    expect(otherCallback).not.toHaveBeenCalled()
    unsubscribe()
    expect(bridge.removeListener).toHaveBeenCalledExactlyOnceWith(channel, listener)
  })
})
