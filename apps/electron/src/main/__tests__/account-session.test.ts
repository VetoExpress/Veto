import { describe, expect, it, vi } from 'vitest'
import { AuthError } from '@vetoexpress/auth'
import { createAccountSession, type StoredAccount } from '../account-session'

const user = { name: '用户', email: 'test@example.test', avatar: '', organization: '模联' }
function setup(saved: StoredAccount | null = null) {
  const client = {
    login: vi.fn().mockResolvedValue('secret-token'),
    fetchMe: vi.fn().mockResolvedValue(user)
  }
  const storage = {
    load: vi.fn().mockResolvedValue(saved),
    save: vi.fn().mockResolvedValue(true),
    clear: vi.fn().mockResolvedValue(undefined)
  }
  const changed = vi.fn()
  return { client, storage, changed, session: createAccountSession(client, storage, changed) }
}

describe('desktop account session', () => {
  it('logs in, saves credentials, publishes user state without credentials, and signs out', async () => {
    const { session, client, storage, changed } = setup()
    expect((await session.getSession()).user).toBeNull()
    expect(await session.login(' test@example.test ', ' password ')).toEqual({
      user,
      persistent: true,
      warning: null
    })
    expect(client.login).toHaveBeenCalledWith(user.email, ' password ')
    expect(storage.save).toHaveBeenCalledWith({ token: 'secret-token', user })
    expect(JSON.stringify(changed.mock.calls)).not.toContain('secret-token')
    await session.signOut()
    expect(storage.clear).toHaveBeenCalledOnce()
    expect((await session.getSession()).user).toBeNull()
  })

  it('restores and revalidates an encrypted saved session', async () => {
    const { session, client } = setup({ token: 'saved-token', user })
    expect((await session.getSession()).user).toEqual(user)
    expect(client.fetchMe).toHaveBeenCalledWith('saved-token')
  })

  it('retains cached user on network failure but clears credentials when server rejects them', async () => {
    const { session, client, storage } = setup({ token: 'saved-token', user })
    client.fetchMe.mockRejectedValueOnce(new AuthError('无法连接认证服务'))
    expect(await session.getSession()).toEqual({
      user,
      persistent: true,
      warning: '无法连接认证服务'
    })
    expect(storage.clear).not.toHaveBeenCalled()
    client.fetchMe.mockRejectedValueOnce(new AuthError('expired', 401))
    expect((await session.refresh()).user).toBeNull()
    expect(storage.clear).toHaveBeenCalledOnce()
  })

  it('clears corrupted storage and remains usable for a new login', async () => {
    const { session, storage } = setup()
    storage.load.mockRejectedValueOnce(new Error('bad encryption'))
    expect((await session.getSession()).warning).toContain('无法恢复')
    expect(storage.clear).toHaveBeenCalledOnce()
    expect((await session.login(user.email, 'password')).user).toEqual(user)
  })

  it('keeps login in memory when secure persistence is unavailable', async () => {
    const { session, storage } = setup()
    storage.save.mockResolvedValue(false)
    expect(await session.login(user.email, 'password')).toMatchObject({
      user,
      persistent: false,
      warning: expect.any(String)
    })
  })

  it('does not replace an existing account when login or persistence fails', async () => {
    const { session, client, storage } = setup({ token: 'saved-token', user })
    await session.getSession()
    client.login.mockRejectedValueOnce(new AuthError('邮箱或密码错误', 401))
    await expect(session.login('other@example.test', 'wrong')).rejects.toThrow('邮箱或密码错误')
    storage.save.mockRejectedValueOnce(new Error('disk full'))
    await expect(session.login('other@example.test', 'password')).rejects.toThrow('disk full')
    expect((await session.getSession()).user).toEqual(user)
  })

  it('serializes sign-out behind an in-flight login so a late response cannot restore it', async () => {
    const { session, client } = setup()
    let resolve!: (token: string) => void
    client.login.mockReturnValueOnce(
      new Promise<string>((done) => {
        resolve = done
      })
    )
    await session.getSession()
    const login = session.login(user.email, 'password')
    const logout = session.signOut()
    await vi.waitFor(() => expect(client.login).toHaveBeenCalled())
    resolve('late-token')
    await Promise.all([login, logout])
    expect((await session.getSession()).user).toBeNull()
  })
})
