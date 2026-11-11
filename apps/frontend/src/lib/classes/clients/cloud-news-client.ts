import type { News } from '../../../../../shared/content-types'
import { t, getLocale } from '$lib/i18n'

const apiBase = (import.meta.env.VITE_CLOUD_API_URL ?? 'https://api.miaoyww.top/v1').replace(/\/$/, '')

export class CloudNewsError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'CloudNewsError'
  }
}

async function request<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${token}`)
    headers.set('Accept-Language', getLocale())
    if (init.body) headers.set('Content-Type', 'application/json')
    response = await fetch(new URL(path.replace(/^\//, ''), `${apiBase}/`), { ...init, headers })
  } catch {
    throw new CloudNewsError(t('services_cloud_unavailable'))
  }
  const payload = (await response.json().catch(() => null)) as T | { error?: { message?: string } } | null
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload ? payload.error?.message : undefined
    throw new CloudNewsError(message ?? t('services_news_failed'), response.status)
  }
  return payload as T
}

export interface NewsListResult {
  ok: true
  timezone: string
  news: News[]
}

export interface NewsRevision {
  revision: number
  source: string
  title: string
  content: string
  contentTime: number
  submittedAt: string
  decision?: 'approved' | 'rejected'
  reviewNote?: string
  reviewedAt?: string
}

export interface NewsInput {
  source: string
  title: string
  content: string
  contentTime?: number
}

export const newsDraftPrefix = `${apiBase}:news-draft:`

export function listPublishedNews(token: string): Promise<NewsListResult> {
  return request(token, '/veto/news')
}

export function listMyNews(token: string): Promise<NewsListResult> {
  return request(token, '/veto/news/mine')
}

export function listNewsWorkflow(token: string): Promise<NewsListResult> {
  return request(token, '/veto/news/workflow')
}

export function listNewsRevisions(token: string, id: string): Promise<{ ok: true; revisions: NewsRevision[] }> {
  return request(token, `/veto/news/${encodeURIComponent(id)}/revisions`)
}

export function submitCloudNews(token: string, input: NewsInput, key: string): Promise<{ ok: true; news: News }> {
  return request(token, '/veto/news', {
    method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(input)
  })
}

export function resubmitCloudNews(token: string, id: string, input: NewsInput): Promise<{ ok: true; news: News }> {
  return request(token, `/veto/news/${encodeURIComponent(id)}/resubmit`, {
    method: 'POST', body: JSON.stringify(input)
  })
}

export function reviewCloudNews(token: string, id: string, decision: 'approve' | 'reject', note: string): Promise<{ ok: true; news: News }> {
  return request(token, `/veto/news/${encodeURIComponent(id)}/${decision}`, {
    method: 'POST', body: JSON.stringify({ note })
  })
}

export function withdrawCloudNews(token: string, id: string, reason: string): Promise<{ ok: true }> {
  return request(token, `/veto/news/${encodeURIComponent(id)}/withdraw`, {
    method: 'POST', body: JSON.stringify({ reason })
  })
}
