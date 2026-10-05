import { get, writable } from 'svelte/store'
import type { Conference as ConferenceDTO } from '$lib/classes/types/conference'
import { accountRequest } from '$lib/classes/clients/account-conference-client'
import { accountStore } from '../app/account-store'
import { conferences, conferencesReady, conferenceSaveStatus, currentConferenceId, deleteConference, restoreSyncedConference, saveConferencesNow } from './conference-store'
import { planConferenceSync } from '$lib/classes/services/conference-sync-plan'

interface Archive { conferenceId: string; snapshot: ConferenceDTO; version: number }
interface Tracking { owner: string; fingerprint?: string; version: number }
interface SyncState { enabled: boolean; syncing: boolean; error: string; syncedAt: number | null; conflicts: { id: string; name: string }[] }
const PREFERENCE_KEY = 'veto.conference-cloud-sync'
const TRACKING_KEY = 'veto.conference-cloud-tracking'
function read<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback } catch { return fallback }
}
const state = writable<SyncState>({ enabled: read<boolean>(PREFERENCE_KEY, true) !== false, syncing: false, error: '', syncedAt: null, conflicts: [] })
let tracking = read<Record<string, Tracking>>(TRACKING_KEY, {})
let running: Promise<void> | null = null
let requested = false
let generation = 0
let timer: ReturnType<typeof setTimeout> | undefined
const choices = new Map<string, 'local' | 'cloud'>()
function persistTracking() { localStorage.setItem(TRACKING_KEY, JSON.stringify(tracking)) }
async function fingerprint(snapshot: ConferenceDTO): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(snapshot)))
  return Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join('')
}
function localSnapshot(id: string): ConferenceDTO | undefined {
  const conference = get(conferences).find((c) => c.id === id && c.source !== 'cloud')
  return conference?.toJSON()
}
async function reconcile(): Promise<void> {
  const email = get(accountStore).user?.email
  const connection = generation
  if (!email || !get(state).enabled) return
  state.update((s) => ({ ...s, syncing: true, error: '' }))
  const valid = () => connection === generation && get(state).enabled && get(accountStore).user?.email === email
  try {
    await conferencesReady
    if (get(conferenceSaveStatus).state === 'error') throw new Error('本机大会存档尚未成功加载，请先恢复本地存储')
    const remote = new Map<string, Archive>()
    let cursor: string | null = null
    do {
      const page: { archives: Archive[]; nextCursor: string | null } = await accountRequest(`app-conferences${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, {}, email)
      if (!valid()) return
      for (const archive of page.archives) remote.set(archive.conferenceId, archive)
      cursor = page.nextCursor
    } while (cursor)
    const local = get(conferences).filter((c) => c.source !== 'cloud')
    // Existing unowned local conferences belong to the first account that syncs them.
    for (const conference of local) {
      if (!tracking[conference.id]) tracking[conference.id] = { owner: email, version: 0 }
    }
    persistTracking()
    const ids = new Set([...local.map((c) => c.id), ...remote.keys(), ...Object.keys(tracking).filter((id) => tracking[id].owner === email)])
    const conflicts: SyncState['conflicts'] = []
    for (const id of ids) {
      if (!valid()) return
      const tracked = tracking[id]
      if (tracked && tracked.owner !== email) continue
      const cloud = remote.get(id)
      const snapshot = localSnapshot(id)
      const localHash = snapshot ? await fingerprint(snapshot) : undefined
      const cloudHash = cloud ? await fingerprint(cloud.snapshot) : undefined
      if (!valid()) return
      let action = planConferenceSync(localHash, cloudHash, tracked?.fingerprint)
      const choice = choices.get(id)
      if (choice) action = choice === 'local' ? (snapshot ? 'upload' : 'delete-cloud') : (cloud ? 'download' : 'delete-local')
      // Never replace the live conference underneath a running Chair workspace.
      if ((action === 'download' || action === 'delete-local') && get(currentConferenceId) === id) action = 'conflict'
      if (action === 'conflict') {
        conflicts.push({ id, name: snapshot?.name ?? cloud?.snapshot.name ?? id }); continue
      }
      if (action === 'upload' && snapshot) {
        const saved = await accountRequest<{ version: number }>(`app-conferences/${encodeURIComponent(id)}`, {
          method: 'PUT', headers: { 'If-Match': `"${cloud?.version ?? 0}"` }, body: JSON.stringify({ snapshot })
        }, email)
        if (!valid()) return
        tracking[id] = { owner: email, version: saved.version, fingerprint: localHash }
      } else if (action === 'download' && cloud) {
        // An edit can arrive while hashing or fetching; defer instead of overwriting it.
        const latest = localSnapshot(id)
        if ((latest ? await fingerprint(latest) : undefined) !== localHash) { requested = true; continue }
        if (!valid()) return
        restoreSyncedConference(cloud.snapshot)
        if (!await saveConferencesNow()) throw new Error('云端大会已下载，但本机存档保存失败，请重试')
        tracking[id] = { owner: email, version: cloud.version, fingerprint: cloudHash }
      } else if (action === 'delete-cloud' && cloud) {
        await accountRequest(`app-conferences/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'If-Match': `"${cloud.version}"` } }, email)
        if (!valid()) return
        delete tracking[id]
      } else if (action === 'delete-local') {
        const latest = localSnapshot(id)
        if ((latest ? await fingerprint(latest) : undefined) !== localHash) { requested = true; continue }
        if (!valid()) return
        deleteConference(id); delete tracking[id]
      } else if (cloud) {
        tracking[id] = { owner: email, version: cloud.version, fingerprint: cloudHash }
      } else { delete tracking[id] }
      choices.delete(id)
      persistTracking()
    }
    if (valid()) state.update((s) => ({ ...s, conflicts, syncedAt: conflicts.length ? s.syncedAt : Date.now() }))
  } catch (error) {
    if (valid()) state.update((s) => ({ ...s, error: error instanceof Error ? error.message : '云同步失败，请重试' }))
  } finally {
    state.update((s) => ({ ...s, syncing: false }))
  }
}
async function sync(): Promise<void> {
  requested = true
  if (running) return running
  running = (async () => { while (requested) { requested = false; await reconcile() } })()
  try { await running } finally { running = null }
}
function schedule() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { timer = undefined; void sync() }, 2500)
}
export const conferenceSync = {
  subscribe: state.subscribe,
  sync,
  setEnabled(enabled: boolean) {
    generation++
    localStorage.setItem(PREFERENCE_KEY, JSON.stringify(enabled))
    state.update((s) => ({ ...s, enabled, error: '', conflicts: [] }))
    if (enabled) void sync()
  },
  resolve(id: string, choice: 'local' | 'cloud') { choices.set(id, choice); void sync() },
  start() {
    let email: string | null | undefined
    const stopAccount = accountStore.subscribe((account) => {
      const next = account.user?.email ?? null
      if (email === next) return
      email = next; generation++; choices.clear()
      state.update((s) => ({ ...s, error: '', syncedAt: null, conflicts: [] }))
      void sync()
    })
    const stopConferences = conferences.subscribe(schedule)
    const stopCurrent = currentConferenceId.subscribe(schedule)
    const retry = () => void sync()
    window.addEventListener('online', retry)
    const poll = setInterval(retry, 60_000)
    return () => {
      generation++; stopAccount(); stopConferences(); stopCurrent()
      if (timer) clearTimeout(timer)
      clearInterval(poll); window.removeEventListener('online', retry)
    }
  }
}
