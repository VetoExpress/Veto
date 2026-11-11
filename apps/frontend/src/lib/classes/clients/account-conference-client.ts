import { t, getLocale } from '$lib/i18n'

const apiBase = (import.meta.env.VITE_CLOUD_API_URL || 'https://api.miaoyww.top/v1').replace(/\/$/, '')

export interface PlatformConference {
  id: string
  name: string
  description?: string
  organizer?: string
  lifecycle: 'draft' | 'active' | 'closed'
  createdAt: string
  updatedAt: string
  committeeCount?: number
  seatCount?: number
}

export async function accountRequest<T>(path: string, init: RequestInit = {}, expectedEmail?: string): Promise<T> {
  const bridge = typeof window === 'undefined' ? undefined : window.veto?.account
  if (!bridge?.getAccessToken) throw new Error(t('services_desktop_signin'))
  const result = await bridge.getAccessToken()
  if (!result.ok) throw new Error(result.error)
  if (!result.token || !result.session.user) throw new Error(t('services_desktop_signin'))
  if (expectedEmail && result.session.user.email !== expectedEmail) throw new Error(t('services_account_changed'))
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${result.token}`)
  headers.set('Accept-Language', getLocale())
  if (init.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${apiBase}/${path}`, { ...init, headers, signal: AbortSignal.timeout(20_000) })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401) await bridge.signOut(result.token)
    throw new Error(payload?.error?.message || t('services_conference_unavailable'))
  }
  return payload as T
}

export async function listAccountConferences(email: string): Promise<PlatformConference[]> {
  const conferences: PlatformConference[] = []
  let cursor: string | null = null
  do {
    const query = new URLSearchParams({ status: 'active', limit: '100' })
    if (cursor) query.set('cursor', cursor)
    const page = await accountRequest<{ conferences: PlatformConference[]; nextCursor: string | null }>(`conferences?${query}`, {}, email)
    conferences.push(...page.conferences)
    cursor = page.nextCursor
  } while (cursor)
  // Older deployments omit summary counts; use their existing detail endpoint.
  for (let offset = 0; offset < conferences.length; offset += 4) {
    await Promise.all(conferences.slice(offset, offset + 4).map(async (conference) => {
      if (conference.committeeCount !== undefined && conference.seatCount !== undefined) return
      try {
        const detail = await accountRequest<{ conference: { committees: { seats: unknown[] }[] } }>(
          `conferences/${encodeURIComponent(conference.id)}`, {}, email
        )
        conference.committeeCount = detail.conference.committees.length
        conference.seatCount = detail.conference.committees.reduce((count, committee) => count + committee.seats.length, 0)
      } catch {
        // Keep accessible conferences listed even when an individual detail request fails.
      }
    }))
  }
  return conferences
}

export function platformConferenceUrl(id: string): string {
  return `https://platform.miaoyww.top/conferences/${encodeURIComponent(id)}?from=app`
}
