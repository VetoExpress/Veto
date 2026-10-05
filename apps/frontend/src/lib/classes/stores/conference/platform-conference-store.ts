import { get, writable } from 'svelte/store'
import { accountStore } from '../app/account-store'
import { listAccountConferences, platformConferenceUrl, type PlatformConference } from '$lib/classes/clients/account-conference-client'
import { lastOpenedConferenceId } from './conference-store'

export const platformConferences = writable<{ conferences: PlatformConference[]; loading: boolean; error: string }>({ conferences: [], loading: false, error: '' })
let revision = 0

export async function refreshPlatformConferences(): Promise<void> {
  const email = get(accountStore).user?.email
  const request = ++revision
  platformConferences.set({ conferences: [], loading: !!email, error: '' })
  if (!email) return
  try {
    const conferences = await listAccountConferences(email)
    if (request === revision && get(accountStore).user?.email === email)
      platformConferences.set({ conferences, loading: false, error: '' })
  } catch (error) {
    if (request === revision)
      platformConferences.set({ conferences: [], loading: false, error: error instanceof Error ? error.message : '加载云平台大会失败' })
  }
}

export function openPlatformConference(conference: PlatformConference): void {
  lastOpenedConferenceId.set(conference.id)
  window.location.replace(platformConferenceUrl(conference.id))
}

export function watchPlatformConferences(): () => void {
  let email: string | null | undefined
  const unsubscribe = accountStore.subscribe((account) => {
    const next = account.user?.email ?? null
    if (next === email) return
    email = next
    void refreshPlatformConferences()
  })
  return () => { revision++; unsubscribe() }
}
