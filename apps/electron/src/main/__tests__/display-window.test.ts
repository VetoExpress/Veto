import { afterEach, describe, expect, it, vi } from 'vitest'
const { handlers, windows } = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => any>(), windows: [] as any[] }))
vi.mock('electron', () => ({
  ipcMain: { handle: (name: string, handler: (...args: any[]) => any) => handlers.set(name, handler) },
  BrowserWindow: class {
    loadURL = vi.fn()
    focus = vi.fn()
    isDestroyed = () => false
    on = vi.fn()
    webContents = { send: vi.fn(), once: (_name: string, callback: () => void) => queueMicrotask(callback) }
    constructor() { windows.push(this) }
  },
}))
import { registerConferenceIpc } from '../ipc/conference'
describe('投屏窗口打开流程', () => {
  afterEach(() => { vi.unstubAllEnvs(); handlers.clear(); windows.length = 0 })
  it.each([['http://localhost:5173', 'http://localhost:5173/display/committee'], ['', 'veto://app/display/committee']])('opens a route pathname in development and packaged builds', async (url, expected) => {
    vi.stubEnv('ELECTRON_RENDERER_URL', url)
    registerConferenceIpc({ current: null })
    expect(await handlers.get('veto:conference:open-display')!(null, 'committee')).toEqual({ success: true })
    expect(windows[0].loadURL).toHaveBeenCalledWith(expected)
    await handlers.get('veto:conference:open-display')!(null, 'committee')
    expect(windows).toHaveLength(1)
    expect(windows[0].focus).toHaveBeenCalledOnce()
  })
})
