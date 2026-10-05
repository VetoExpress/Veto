import { describe, expect, it, vi } from 'vitest'
import { get } from 'svelte/store'
import type { AccountResult, AccountSnapshot, DesktopAccountAPI } from '@vetoexpress/auth/desktop'
import { createAccountStore } from './account-store'

const empty: AccountSnapshot = { user: null, persistent: false, warning: null }
const loggedIn: AccountSnapshot = {
  ...empty,
  persistent: true,
  user: { name: '用户', email: 'test@example.test', avatar: '', organization: '模联' }
}

function bridge() {
  let listener: ((session: AccountSnapshot) => void) | undefined
  const unsubscribe = vi.fn()
  const api: DesktopAccountAPI = {
    getAccessToken: vi.fn(),
    adoptToken: vi.fn(),
    sendPasswordCode: vi.fn().mockResolvedValue({ ok: true, session: loggedIn }),
    resetPassword: vi.fn().mockResolvedValue({ ok: true, session: empty }),
    updateProfile: vi.fn().mockResolvedValue({ ok: true, session: loggedIn }),
    getSession: vi.fn().mockResolvedValue({ ok: true, session: empty }),
    login: vi.fn().mockResolvedValue({ ok: true, session: loggedIn }),
    refresh: vi.fn().mockResolvedValue({ ok: true, session: loggedIn }),
    signOut: vi.fn().mockResolvedValue({ ok: true, session: empty }),
    onChanged: (callback) => {
      listener = callback
      return unsubscribe
    }
  }
  return { api, unsubscribe, emit: (session: AccountSnapshot) => listener?.(session) }
}

describe('renderer account state', () => {
  it('retains the account on recovery errors and signs out after resetting the password', async () => {
    const store = createAccountStore()
    const { api } = bridge()
    store.connect(api)
    await vi.waitFor(() => expect(get(store).ready).toBe(true))
    await store.sendPasswordCode()
    vi.mocked(api.resetPassword).mockResolvedValueOnce({ ok: false, error: '验证码错误' })
    await expect(store.resetPassword('000000', 'password')).rejects.toThrow('验证码错误')
    expect(get(store).user).toEqual(loggedIn.user)
    await store.resetPassword('123456', 'password')
    expect(get(store)).toMatchObject({ user: null, pending: false, error: null })
  })
  it('updates public state and rejects failed saves so the form cannot report success', async () => {
    const store = createAccountStore()
    const { api } = bridge()
    store.connect(api)
    await vi.waitFor(() => expect(get(store).ready).toBe(true))
    await store.updateProfile({ name: '用户' })
    expect(get(store).user).toEqual(loggedIn.user)
    vi.mocked(api.updateProfile).mockResolvedValueOnce({ ok: false, error: '头像太大' })
    await expect(store.updateProfile({ avatar: 'invalid' })).rejects.toThrow('头像太大')
    expect(get(store)).toMatchObject({ pending: false, error: '头像太大', user: loggedIn.user })
  })
  it('uses desktop state and unsubscribes when disconnected', async () => {
    const store = createAccountStore()
    const { api, emit, unsubscribe } = bridge()
    const disconnect = store.connect(api)
    await vi.waitFor(() => expect(get(store).ready).toBe(true))
    await store.run('login', 'email', 'password')
    expect(get(store).user).toEqual(loggedIn.user)
    emit(empty)
    expect(get(store).user).toBeNull()
    disconnect()
    expect(unsubscribe).toHaveBeenCalledOnce()
    emit(loggedIn)
    expect(get(store).user).toBeNull()
  })

  it('does not overwrite a newer change event with an older initial response', async () => {
    const store = createAccountStore()
    const { api, emit } = bridge()
    let resolve!: (result: AccountResult) => void
    api.getSession = () =>
      new Promise((done) => {
        resolve = done
      })
    store.connect(api)
    emit(loggedIn)
    resolve({ ok: true, session: empty })
    await Promise.resolve()
    expect(get(store).user).toEqual(loggedIn.user)
  })

  it('shows authentication errors and releases the pending state on transport failure', async () => {
    const store = createAccountStore()
    const { api } = bridge()
    store.connect(api)
    await vi.waitFor(() => expect(get(store).ready).toBe(true))
    vi.mocked(api.login).mockResolvedValueOnce({ ok: false, error: '邮箱或密码错误', status: 401 })
    await store.run('login', 'email', 'wrong')
    expect(get(store)).toMatchObject({ error: '邮箱或密码错误', pending: false, user: null })
    vi.mocked(api.login).mockRejectedValueOnce(new Error('IPC disconnected'))
    await store.run('login', 'email', 'password')
    expect(get(store)).toMatchObject({ error: '账号操作失败，请重试。', pending: false })
  })

  it('supports the web environment without invoking desktop APIs', async () => {
    const store = createAccountStore()
    store.connect(undefined)
    await store.run('login', 'email', 'password')
    expect(get(store)).toMatchObject({ ready: true, available: false, user: null })
  })
})
