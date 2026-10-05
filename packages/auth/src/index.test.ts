import { describe, expect, it, vi } from 'vitest'
import { AuthError, createAuthClient } from './index'

const apiBaseUrl = 'https://api.example.test/'
const user = { name: '测试用户', email: 'user@example.test', avatar: '', organization: '测试模联' }
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('auth client', () => {
  it('patches user details with bearer authorization and refreshes the cache', async () => {
    const updated = { ...user, name: '新姓名', created_at: '2026-10-05T00:00:00Z' }
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(response({ ok: true, user: updated }))
    const auth = createAuthClient({ apiBaseUrl, fetch })
    expect(await auth.patchMe('token', { name: '新姓名' })).toEqual(updated)
    expect(fetch.mock.calls[0][1]).toMatchObject({
      method: 'PATCH',
      body: JSON.stringify({ name: '新姓名' })
    })
    expect(new Headers(fetch.mock.calls[0][1]!.headers).get('Authorization')).toBe('Bearer token')
    expect(auth.readCachedUser('token')).toEqual(updated)
  })
  it('sends login and email verification requests using the configured transport', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response({ ok: true, token: 'account-token' }))
      .mockResolvedValueOnce(response({ ok: true }))
      .mockResolvedValueOnce(response({ ok: true, regToken: 'registration-token' }))
    const auth = createAuthClient({ apiBaseUrl, fetch })

    expect(await auth.login(user.email, 'password')).toBe('account-token')
    await auth.sendVerificationCode(user.email)
    expect(await auth.verifyCode(user.email, '012345')).toBe('registration-token')
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      `${apiBaseUrl}v1/auth/login`,
      `${apiBaseUrl}v1/auth/send-code`,
      `${apiBaseUrl}v1/auth/verify-code`
    ])
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toEqual({
      email: user.email,
      password: 'password'
    })
    expect(JSON.parse(fetch.mock.calls[2][1]!.body as string)).toEqual({
      email: user.email,
      code: '012345'
    })
  })

  it('validates required registration details and trims them before submission', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(response({ ok: true, token: 'token' }))
    const auth = createAuthClient({ apiBaseUrl, fetch })
    await expect(auth.register('reg', 'password', ' ', '模联')).rejects.toThrow('请填写姓名')
    await expect(auth.register('reg', 'password', '姓名', ' ')).rejects.toThrow('请填写所属模联')
    expect(fetch).not.toHaveBeenCalled()
    expect(await auth.register('reg', ' password ', ' 姓名 ', ' 模联 ')).toBe('token')
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toEqual({
      regToken: 'reg',
      password: ' password ',
      name: '姓名',
      organization: '模联'
    })
  })

  it('isolates caches between client instances and tokens while allowing user refresh', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response({ ok: true, user }))
      .mockResolvedValueOnce(response({ ok: true, user: { ...user, name: '新姓名' } }))
    const auth = createAuthClient({ apiBaseUrl, fetch })
    const other = createAuthClient({ apiBaseUrl, fetch })
    expect(await auth.fetchMe('token')).toEqual(user)
    expect(new Headers(fetch.mock.calls[0][1]!.headers).get('Authorization')).toBe('Bearer token')
    expect(auth.readCachedUser('token')).toEqual(user)
    expect(auth.readCachedUser('other-token')).toBeUndefined()
    expect(other.readCachedUser('token')).toBeUndefined()
    await auth.fetchMe('token')
    expect(auth.readCachedUser('token')?.name).toBe('新姓名')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('preserves authentication errors and does not cache unauthorized responses', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => response({ ok: false, error: '登录已失效' }, 401))
    const auth = createAuthClient({ apiBaseUrl, fetch })
    await expect(auth.fetchMe('expired')).rejects.toBeInstanceOf(AuthError)
    await expect(auth.fetchMe('expired')).rejects.toMatchObject({
      status: 401,
      message: '登录已失效'
    })
    expect(auth.readCachedUser('expired')).toBeUndefined()
  })

  it('reports missing configuration and network failures', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(
      createAuthClient({ apiBaseUrl: '', fetch }).login('email', 'password')
    ).rejects.toThrow('API 服务暂未配置')
    expect(fetch).not.toHaveBeenCalled()
    await expect(
      createAuthClient({ apiBaseUrl, fetch }).login('email', 'password')
    ).rejects.toThrow('无法连接认证服务')
  })
})
