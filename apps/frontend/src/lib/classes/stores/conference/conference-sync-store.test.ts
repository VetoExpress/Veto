import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { get, type Writable } from 'svelte/store'

vi.mock('../app/account-store', async () => {
  const { writable } = await import('svelte/store')
  return { accountStore: writable({ user: { email: 'owner@example.test' } }) }
})
vi.mock('$lib/classes/clients/account-conference-client', () => ({ accountRequest: vi.fn() }))
vi.mock('./conference-store', async () => {
  const { writable } = await import('svelte/store')
  const conferences = writable<any[]>([])
  return {
    conferences, conferencesReady: Promise.resolve(), conferenceSaveStatus: writable({ state: 'saved' }),
    currentConferenceId: writable(null), saveConferencesNow: vi.fn().mockResolvedValue(true),
    restoreSyncedConference: (data: any) => conferences.update((list) => [...list.filter((c) => c.id !== data.id), { ...data, toJSON: () => data }]),
    deleteConference: (id: string) => conferences.update((list) => list.filter((c) => c.id !== id))
  }
})
const snapshot = { id: 'one', name: '本地大会', mode: 'singleton', createdAt: 1, updatedAt: 2, committees: [{ id: 'c', name: '会场', seats: [] }] }
beforeEach(() => {
  vi.resetModules()
  const data = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks() })
async function setup() {
  const { accountRequest } = await import('$lib/classes/clients/account-conference-client')
  const { conferences } = await import('./conference-store')
  const accountStore = (await import('../app/account-store')).accountStore as unknown as Writable<{ user: { email: string } | null }>
  accountStore.set({ user: { email: 'owner@example.test' } })
  conferences.set([])
  const { conferenceSync } = await import('./conference-sync-store')
  return { request: vi.mocked(accountRequest), conferences, accountStore, conferenceSync }
}
function local(data = snapshot) { return { ...data, toJSON: () => data } as any }
describe('App cloud sync coordinator', () => {
  it('automatically syncs at most once per 24 hours despite edits, reconnects and restart', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-05T12:00:00Z'))
    vi.stubGlobal('window', new EventTarget())
    const { request, conferences, conferenceSync } = await setup()
    request.mockResolvedValue({ archives: [], nextCursor: null })
    let stop = conferenceSync.start()
    await vi.advanceTimersByTimeAsync(1)
    expect(request).toHaveBeenCalledTimes(1)
    conferences.set([local()])
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(request).toHaveBeenCalledTimes(1)
    stop()
    vi.resetModules()
    const restarted = await import('./conference-sync-store')
    stop = restarted.conferenceSync.start()
    await vi.advanceTimersByTimeAsync(1)
    expect(request).toHaveBeenCalledTimes(1)
    expect(get(restarted.conferenceSync).syncedAt).not.toBeNull()
    conferences.set([])
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000 - 60_002)
    expect(request).toHaveBeenCalledTimes(2)
    await restarted.conferenceSync.sync()
    expect(request).toHaveBeenCalledTimes(3)
    stop()
  })
  it('does not retry failures or restart automatic sync when toggled within a day', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-05T12:00:00Z'))
    vi.stubGlobal('window', new EventTarget())
    const { request, conferenceSync } = await setup()
    request.mockRejectedValue(new Error('网络不可用'))
    const stop = conferenceSync.start()
    await vi.advanceTimersByTimeAsync(1)
    expect(request).toHaveBeenCalledTimes(1)
    expect(get(conferenceSync).error).toBe('网络不可用')
    window.dispatchEvent(new Event('online'))
    conferenceSync.setEnabled(false)
    conferenceSync.setEnabled(true)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(request).toHaveBeenCalledTimes(1)
    await conferenceSync.sync()
    expect(request).toHaveBeenCalledTimes(2)
    stop()
  })
  it('is enabled by default and uploads existing local conferences once', async () => {
    const { request, conferences, conferenceSync } = await setup()
    conferences.set([local()])
    request.mockResolvedValueOnce({ archives: [], nextCursor: null }).mockResolvedValueOnce({ version: 1 })
    expect(get(conferenceSync).enabled).toBe(true)
    await conferenceSync.sync()
    expect(request.mock.calls[1]).toEqual(['app-conferences/one', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ snapshot }) }), 'owner@example.test'])
    request.mockResolvedValueOnce({ archives: [{ conferenceId: 'one', snapshot, version: 1 }], nextCursor: null })
    await conferenceSync.sync()
    expect(request).toHaveBeenCalledTimes(3)
  })
  it('restores the cloud copy on a new device and saves it locally', async () => {
    const { request, conferences, conferenceSync } = await setup()
    request.mockResolvedValueOnce({ archives: [{ conferenceId: 'one', snapshot, version: 2 }], nextCursor: null })
    await conferenceSync.sync()
    expect(get(conferences)[0].toJSON()).toEqual(snapshot)
    expect(get(conferenceSync).error).toBe('')
  })
  it('does no cloud work while disabled or logged out', async () => {
    const { request, conferenceSync, accountStore } = await setup()
    conferenceSync.setEnabled(false)
    await conferenceSync.sync()
    expect(request).not.toHaveBeenCalled()
    accountStore.set({ user: null } as any)
    conferenceSync.setEnabled(true)
    await conferenceSync.sync()
    expect(request).not.toHaveBeenCalled()
  })
  it('never uploads conferences already owned by a different account', async () => {
    localStorage.setItem('veto.conference-cloud-tracking', JSON.stringify({ one: { owner: 'other@example.test', version: 1 } }))
    const { request, conferences, conferenceSync } = await setup()
    conferences.set([local()])
    request.mockResolvedValue({ archives: [], nextCursor: null })
    await conferenceSync.sync()
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('reports conflicts and only overwrites after an explicit choice', async () => {
    const { request, conferences, conferenceSync } = await setup()
    conferences.set([local()])
    const cloud = { ...snapshot, name: '其他设备' }
    request.mockResolvedValue({ archives: [{ conferenceId: 'one', snapshot: cloud, version: 3 }], nextCursor: null })
    await conferenceSync.sync()
    expect(get(conferenceSync).conflicts).toEqual([{ id: 'one', name: '本地大会' }])
    expect(get(conferences)[0].name).toBe('本地大会')
    conferenceSync.resolve('one', 'cloud')
    await conferenceSync.sync()
    expect(get(conferences)[0].name).toBe('其他设备')
  })
  it('ignores a cloud response arriving after the account switches', async () => {
    const { request, conferences, conferenceSync, accountStore } = await setup()
    let complete!: (value: any) => void
    request.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve }))
    const running = conferenceSync.sync()
    await vi.waitFor(() => expect(request).toHaveBeenCalled())
    accountStore.set({ user: { email: 'other@example.test' } } as any)
    complete({ archives: [{ conferenceId: 'one', snapshot, version: 1 }], nextCursor: null })
    await running
    expect(get(conferences)).toEqual([])
  })
})
