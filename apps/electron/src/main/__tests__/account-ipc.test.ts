import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IpcMainInvokeEvent } from 'electron'
import { AuthError } from '@vetoexpress/auth'

const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>>()
}))
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: typeof handlers extends Map<string, infer T> ? T : never) =>
      handlers.set(channel, handler)
  }
}))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }))
import { isAccountOrigin, registerAccountIpc } from '../ipc/account'

const snapshot = { user: null, persistent: false, warning: null }
function event(origin: string, subframe = false) {
  const mainFrame = { origin }
  return {
    senderFrame: subframe ? { origin } : mainFrame,
    sender: { mainFrame }
  } as unknown as IpcMainInvokeEvent
}
describe('account IPC', () => {
  const account = {
    getSession: vi.fn(),
    getAccessToken: vi.fn(),
    adoptToken: vi.fn(),
    login: vi.fn(),
    refresh: vi.fn(),
    updateProfile: vi.fn(),
    signOut: vi.fn()
  }
  beforeEach(() => {
    vi.resetAllMocks()
    handlers.clear()
    for (const method of Object.values(account)) method.mockResolvedValue(snapshot)
    registerAccountIpc(account)
  })
  it('accepts the local app and official platform, rejects unrelated pages and subframes', async () => {
    const get = handlers.get('veto:account:get-session')!
    expect(await get(event('veto://app'))).toEqual({ ok: true, session: snapshot })
    expect(await get(event('https://platform.miaoyww.top'))).toEqual({
      ok: true,
      session: snapshot
    })
    expect(await get(event('https://platform.miaoyww.top.evil.test'))).toMatchObject({ ok: false })
    expect(await get(event('veto://app', true))).toMatchObject({ ok: false })
    expect(account.getSession).toHaveBeenCalledTimes(2)
    expect(isAccountOrigin('http://localhost:5173', false)).toBe(false)
    expect(isAccountOrigin('https://evil.test', true)).toBe(false)
  })
  it('only returns credentials to trusted top-level frames and validates adopted tokens', async () => {
    const get = handlers.get('veto:account:get-access-token')!
    account.getAccessToken.mockResolvedValue({ session: snapshot, token: 'account-token' })
    expect(await get(event('https://platform.miaoyww.top'))).toMatchObject({
      ok: true,
      token: 'account-token'
    })
    expect(await get(event('https://evil.test'))).toMatchObject({ ok: false })
    expect(await get(event('https://platform.miaoyww.top', true))).toMatchObject({ ok: false })
    expect(account.getAccessToken).toHaveBeenCalledOnce()
    const adopt = handlers.get('veto:account:adopt-token')!
    expect(await adopt(event('veto://app'), '', true)).toMatchObject({ ok: false })
    expect(account.adoptToken).not.toHaveBeenCalled()
    await adopt(event('https://platform.miaoyww.top'), 'legacy-token', true)
    expect(account.adoptToken).toHaveBeenCalledWith('legacy-token', true)
  })
  it('validates login input and preserves structured authentication errors', async () => {
    const login = handlers.get('veto:account:login')!
    expect(await login(event('veto://app'), {}, 'password')).toMatchObject({ ok: false })
    expect(account.login).not.toHaveBeenCalled()
    account.login.mockRejectedValueOnce(new AuthError('邮箱或密码错误', 401))
    expect(await login(event('veto://app'), 'test@example.test', 'password')).toEqual({
      ok: false,
      error: '邮箱或密码错误',
      status: 401
    })
  })
  it('restricts profile updates to trusted frames and validates fields before forwarding', async () => {
    const update = handlers.get('veto:account:update-profile')!
    expect(await update(event('https://evil.test'), { name: 'Member' })).toMatchObject({
      ok: false
    })
    expect(await update(event('veto://app', true), { name: 'Member' })).toMatchObject({ ok: false })
    for (const body of [
      null,
      [],
      {},
      { name: ' ' },
      { password: 'short' },
      { email: 'other@example.com' },
      { avatar: 'a'.repeat(699053) }
    ]) {
      expect(await update(event('veto://app'), body)).toMatchObject({ ok: false })
    }
    expect(account.updateProfile).not.toHaveBeenCalled()
    expect(await update(event('veto://app'), { name: 'Member' })).toMatchObject({ ok: true })
    expect(account.updateProfile).toHaveBeenCalledWith({ name: 'Member' })
  })
})
