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
  if (!bridge?.getAccessToken) throw new Error('请先登录桌面账号')
  const result = await bridge.getAccessToken()
  if (!result.ok) throw new Error(result.error)
  if (!result.token || !result.session.user) throw new Error('请先登录桌面账号')
  if (expectedEmail && result.session.user.email !== expectedEmail) throw new Error('账号已切换，请重试')
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${result.token}`)
  if (init.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${apiBase}/${path}`, { ...init, headers, signal: AbortSignal.timeout(20_000) })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401) await bridge.signOut(result.token)
    throw new Error(payload?.error?.message || '无法连接大会服务，请稍后重试')
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
  return conferences
}

export function platformConferenceUrl(id: string): string {
  return `https://platform.miaoyww.top/conferences/${encodeURIComponent(id)}?from=app`
}
