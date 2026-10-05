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
const SCHEDULE_KEY = 'veto.conference-cloud-schedule'
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000
interface SyncHistory { attemptedAt: number; syncedAt: number | null }
function read<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback } catch { return fallback }
}
const state = writable<SyncState>({ enabled: read<boolean>(PREFERENCE_KEY, true) !== false, syncing: false, error: '', syncedAt: null, conflicts: [] })
let tracking = read<Record<string, Tracking>>(TRACKING_KEY, {})
const history = read<Record<string, SyncHistory>>(SCHEDULE_KEY, {})
let running: Promise<void> | null = null
let requested = false
let generation = 0
let timer: ReturnType<typeof setTimeout> | undefined
let watching = false
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
    if (valid()) {
      const syncedAt = conflicts.length ? get(state).syncedAt : Date.now()
      history[email] = { attemptedAt: history[email]?.attemptedAt ?? Date.now(), syncedAt }
      localStorage.setItem(SCHEDULE_KEY, JSON.stringify(history))
      state.update((s) => ({ ...s, conflicts, syncedAt }))
    }
  } catch (error) {
    if (valid()) state.update((s) => ({ ...s, error: error instanceof Error ? error.message : '云同步失败，请重试' }))
  } finally {
    state.update((s) => ({ ...s, syncing: false }))
  }
}
async function sync(): Promise<void> {
  if (running) return running
  const email = get(accountStore).user?.email
  if (!email || !get(state).enabled) return
  history[email] = { attemptedAt: Date.now(), syncedAt: history[email]?.syncedAt ?? null }
  localStorage.setItem(SCHEDULE_KEY, JSON.stringify(history))
  requested = true
  running = (async () => { while (requested) { requested = false; await reconcile() } })()
  try { await running } finally { running = null; schedule() }
}
function schedule() {
  if (timer) clearTimeout(timer)
  timer = undefined
  const email = get(accountStore).user?.email
  if (!watching || !email || !get(state).enabled) return
  const remaining = Math.max(1, (history[email]?.attemptedAt ?? 0) + SYNC_INTERVAL_MS - Date.now())
  timer = setTimeout(() => { timer = undefined; void autoSync() }, Math.min(remaining, SYNC_INTERVAL_MS))
}
async function autoSync(): Promise<void> {
  const email = get(accountStore).user?.email
  if (!email || !get(state).enabled) { schedule(); return }
  const lastAttempt = history[email]?.attemptedAt
  if (lastAttempt !== undefined && Date.now() - lastAttempt < SYNC_INTERVAL_MS) { schedule(); return }
  await sync()
}
export const conferenceSync = {
  subscribe: state.subscribe,
  sync,
  setEnabled(enabled: boolean) {
    generation++
    localStorage.setItem(PREFERENCE_KEY, JSON.stringify(enabled))
    state.update((s) => ({ ...s, enabled, error: '', conflicts: [] }))
    if (enabled) void autoSync()
    else schedule()
  },
  resolve(id: string, choice: 'local' | 'cloud') {
    choices.set(id, choice)
    if (running) requested = true
    void sync()
  },
  start() {
    watching = true
    let email: string | null | undefined
    const stopAccount = accountStore.subscribe((account) => {
      const next = account.user?.email ?? null
      if (email === next) return
      email = next; generation++; choices.clear()
      state.update((s) => ({ ...s, error: '', syncedAt: next ? history[next]?.syncedAt ?? null : null, conflicts: [] }))
      void autoSync()
    })
    const retry = () => void autoSync()
    window.addEventListener('online', retry)
    return () => {
      watching = false
      generation++; stopAccount()
      if (timer) clearTimeout(timer)
      window.removeEventListener('online', retry)
    }
  }
}
