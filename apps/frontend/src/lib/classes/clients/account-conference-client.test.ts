import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules() })
function session(email = 'owner@example.test') {
  const signOut = vi.fn()
  vi.stubGlobal('window', { veto: { account: {
    getAccessToken: vi.fn().mockResolvedValue({ ok: true, token: 'secret', session: { user: { email } } }), signOut
  } } })
  return signOut
}
describe('account conference client', () => {
  it('loads every page using the desktop account and opens the exact platform conference', async () => {
    session()
    vi.stubEnv('VITE_CLOUD_API_URL', 'https://api.example.test/v1')
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ conferences: [{ id: 'one' }], nextCursor: 'next' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ conferences: [{ id: 'two' }], nextCursor: null })))
    vi.stubGlobal('fetch', fetch)
    const { listAccountConferences, platformConferenceUrl } = await import('./account-conference-client')
    expect(await listAccountConferences('owner@example.test')).toEqual([{ id: 'one' }, { id: 'two' }])
    expect(fetch.mock.calls[1][0]).toContain('cursor=next')
    expect(fetch.mock.calls[0][1].headers.get('Authorization')).toBe('Bearer secret')
    expect(platformConferenceUrl('a/b')).toBe('https://platform.miaoyww.top/conferences/a%2Fb?from=app')
  })
  it('never sends a request for a different account', async () => {
    session('other@example.test')
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    const { listAccountConferences } = await import('./account-conference-client')
    await expect(listAccountConferences('owner@example.test')).rejects.toThrow('账号已切换')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('invalidates only the credential that the server rejected', async () => {
    const signOut = session()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })))
    const { listAccountConferences } = await import('./account-conference-client')
    await expect(listAccountConferences('owner@example.test')).rejects.toThrow()
    expect(signOut).toHaveBeenCalledWith('secret')
  })
})
