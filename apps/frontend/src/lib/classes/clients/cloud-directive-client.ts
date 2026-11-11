import { t, getLocale } from '$lib/i18n'

const cloudApiBaseUrl = (
  import.meta.env.VITE_CLOUD_API_URL ?? 'https://api.miaoyww.top/v1'
).replace(/\/$/, '')

export { cloudApiBaseUrl }

export interface CloudDirective {
  id: string
  conferenceId: string
  sourceCommitteeId: string
  sourceSeatId: string
  targetCommitteeId: string
  targetCommitteeName?: string
  title: string
  content: string
  status: 'submitted' | 'processing' | 'approved' | 'rejected' | 'cancelled'
  revision: number
  claimedByMe?: boolean
  claimedAt?: string
  processingNote?: string
  decidedAt?: string
  cancelledAt?: string
  createdAt: string
  updatedAt: string
  author: { committeeName?: string; seatName?: string; role?: string }
}

export interface CloudDirectiveRevision {
  revision: number
  title: string
  content: string
  targetCommitteeId: string
  submittedAt: string
  decision?: 'approved' | 'rejected'
  decisionNote?: string
  decidedAt?: string
}

export class CloudDirectiveError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'CloudDirectiveError'
  }
}

async function request<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    const headers = new Headers(init.headers)
    headers.set('authorization', `Bearer ${token}`)
    headers.set('Accept-Language', getLocale())
    if (init.body) headers.set('content-type', 'application/json')
    response = await fetch(new URL(path.replace(/^\//, ''), `${cloudApiBaseUrl}/`), {
      ...init,
      headers
    })
  } catch {
    throw new CloudDirectiveError(t('services_cloud_unavailable'))
  }
  const payload = (await response.json().catch(() => null)) as T | Record<string, unknown> | null
  if (!response.ok) {
    const error = payload && typeof payload === 'object' && 'error' in payload ? payload.error : null
    const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
      ? error.message
      : t('services_directive_failed')
    throw new CloudDirectiveError(message, response.status)
  }
  return payload as T
}

const root = '/veto/directives'

export function listDirectiveTargets(token: string): Promise<{ ok: true; targets: Array<{ id: string; name: string }> }> {
  return request(token, `${root}/targets`)
}

export function listMyDirectives(token: string): Promise<{ ok: true; directives: CloudDirective[] }> {
  return request(token, `${root}/mine`)
}

export function listDirectiveWorkflow(token: string): Promise<{ ok: true; directives: CloudDirective[] }> {
  return request(token, `${root}/workflow`)
}

export function listDirectiveRevisions(token: string, id: string): Promise<{ ok: true; revisions: CloudDirectiveRevision[] }> {
  return request(token, `${root}/${encodeURIComponent(id)}/revisions`)
}

export function submitCloudDirective(token: string, input: { title: string; content: string; targetCommitteeId: string }, key: string) {
  return request<{ ok: true; directive: CloudDirective }>(token, root, {
    method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(input)
  })
}

export function resubmitCloudDirective(token: string, id: string, input: { title: string; content: string; targetCommitteeId: string }) {
  return request<{ ok: true; directive: CloudDirective }>(token, `${root}/${encodeURIComponent(id)}/resubmit`, {
    method: 'POST', body: JSON.stringify(input)
  })
}

export function transitionCloudDirective(token: string, id: string, action: 'claim' | 'approve' | 'reject' | 'cancel', note?: string) {
  return request<{ ok: true; directive: CloudDirective }>(token, `${root}/${encodeURIComponent(id)}/${action}`, {
    method: 'POST', body: JSON.stringify(note === undefined ? {} : { note })
  })
}
