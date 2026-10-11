import type { SituationUpdate, TimelineProjection } from '../../../../../shared/content-types'

export type CloudSituation = SituationUpdate
export type CloudTimeline = TimelineProjection

export const cloudApiBaseUrl = (
  import.meta.env.VITE_CLOUD_API_URL ?? 'https://api.miaoyww.top/v1'
).replace(/\/$/, '')

export class CloudSituationError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'CloudSituationError'
  }
}

function message(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = payload.error
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
      return error.message
    }
  }
  return fallback
}

async function request<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    const headers = new Headers(init.headers)
    headers.set('authorization', `Bearer ${token}`)
    if (init.body) headers.set('content-type', 'application/json')
    response = await fetch(new URL(path.replace(/^\//, ''), `${cloudApiBaseUrl}/`), {
      ...init,
      headers
    })
  } catch {
    throw new CloudSituationError('无法连接云端服务')
  }
  const payload = (await response.json().catch(() => null)) as T | unknown
  if (!response.ok) throw new CloudSituationError(message(payload, '局势请求失败'), response.status)
  return payload as T
}

export interface SituationListResult {
  ok: true
  timezone: string
  situations: SituationUpdate[]
}

export interface TimelineResult {
  ok: true
  timezone: string
  timeline: TimelineProjection | null
}

export function listCloudSituations(token: string): Promise<SituationListResult> {
  return request(token, '/veto/situations')
}

const pendingTimelines = new Map<string, Promise<TimelineResult>>()

export function getCloudTimeline(token: string): Promise<TimelineResult> {
  const pending = pendingTimelines.get(token)
  if (pending) return pending
  const result = request<TimelineResult>(token, '/veto/timeline').finally(() => {
    if (pendingTimelines.get(token) === result) pendingTimelines.delete(token)
  })
  pendingTimelines.set(token, result)
  return result
}

export function publishCloudSituation(
  token: string,
  input: { content: string; contentTime?: number }
): Promise<{ ok: true; situation: SituationUpdate }> {
  return request(token, '/veto/situations', { method: 'POST', body: JSON.stringify(input) })
}

export function withdrawCloudSituation(
  token: string,
  id: string,
  reason: string
): Promise<{ ok: true }> {
  return request(token, `/veto/situations/${encodeURIComponent(id)}/withdraw`, {
    method: 'POST',
    body: JSON.stringify({ reason })
  })
}

export function controlCloudTimeline(
  token: string,
  input:
    | { action: 'pause' | 'resume' }
    | { action: 'set_ratio'; ratio: number }
    | { action: 'jump'; contentTime: number }
): Promise<TimelineResult> {
  return request(token, '/veto/timeline', {
    method: 'PATCH',
    body: JSON.stringify(input)
  })
}
