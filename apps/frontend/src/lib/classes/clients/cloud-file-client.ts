import type { FileContent } from '../../../../../shared/content-types'
import { t, getLocale } from '$lib/i18n'
export type { FileContent } from '../../../../../shared/content-types'

export type FileVisibility = 'committee' | 'conference'
export interface FileVisibilityRequest {
  id: string
  fileId: string
  requestedVisibility: FileVisibility
  createdAt: string
}
export interface FileNotification {
  id: number
  fileId: string
  kind: 'file.submitted' | 'file.published' | 'file.rejected' | 'file.visibility_requested'
  createdAt: string
}

const apiBase = (import.meta.env.VITE_CLOUD_API_URL ?? 'https://api.miaoyww.top/v1').replace(/\/$/, '')

export class CloudFileError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'CloudFileError'
  }
}

function endpoint(path: string): URL {
  return new URL(path.replace(/^\//, ''), `${apiBase}/`)
}

async function responseError(response: Response, fallback: string): Promise<CloudFileError> {
  const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null
  return new CloudFileError(payload?.error?.message ?? fallback, response.status)
}

async function request<T>(token: string, path: string, init: RequestInit = {}, fallback = t('services_request_failed')): Promise<T> {
  let response: Response
  try {
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${token}`)
    headers.set('Accept-Language', getLocale())
    if (init.body && typeof init.body === 'string') headers.set('Content-Type', 'application/json')
    response = await fetch(endpoint(path), { ...init, headers })
  } catch {
    throw new CloudFileError(t('services_cloud_unavailable'))
  }
  if (!response.ok) throw await responseError(response, fallback)
  return response.json() as Promise<T>
}

export function listCloudFiles(token: string): Promise<{ ok: true; files: FileContent[] }> {
  return request(token, '/veto/files', {}, t('services_files_load'))
}

export function listMyCloudFiles(token: string): Promise<{ ok: true; files: FileContent[] }> {
  return request(token, '/veto/files/mine', {}, t('services_my_files_load'))
}

export function listFileWorkflow(token: string): Promise<{ ok: true; files: FileContent[] }> {
  return request(token, '/veto/files/workflow', {}, t('services_file_workflow_load'))
}

export function listVisibilityWorkflow(token: string): Promise<{ ok: true; requests: FileVisibilityRequest[] }> {
  return request(token, '/veto/files/visibility-workflow', {}, t('services_visibility_load'))
}

export function listFileNotifications(token: string, after: number): Promise<{ ok: true; notifications: FileNotification[]; nextCursor: number }> {
  return request(token, `/veto/files/notifications?after=${after}`, {}, t('services_file_notifications_load'))
}

export async function uploadCloudFile(
  token: string,
  file: globalThis.File,
  metadata: { title: string; fileType: string; visibility: FileVisibility; replacesFileId?: string }
): Promise<FileContent> {
  const headers = new Headers({
    Authorization: `Bearer ${token}`,
    'Accept-Language': getLocale(),
    'Content-Type': file.type || 'application/octet-stream',
    'X-File-Name': encodeURIComponent(file.name),
    'X-File-Title': encodeURIComponent(metadata.title),
    'X-File-Type': encodeURIComponent(metadata.fileType),
    'X-File-Visibility': metadata.visibility,
    ...(metadata.replacesFileId ? { 'X-Replaces-File-Id': metadata.replacesFileId } : {}),
    'X-File-Size': String(file.size)
  })
  let response: Response
  try {
    response = await fetch(endpoint('/veto/files'), { method: 'POST', headers, body: file })
  } catch {
    throw new CloudFileError(t('services_cloud_unavailable'))
  }
  if (!response.ok) throw await responseError(response, t('services_file_upload'))
  return (await response.json() as { file: FileContent }).file
}

export async function downloadCloudFile(token: string, item: FileContent): Promise<void> {
  let response: Response
  try {
    response = await fetch(endpoint(`/veto/files/${encodeURIComponent(item.id)}/download`), {
      headers: { Authorization: `Bearer ${token}`, 'Accept-Language': getLocale() }
    })
  } catch {
    throw new CloudFileError(t('services_cloud_unavailable'))
  }
  if (!response.ok) throw await responseError(response, t('services_file_download'))
  const url = URL.createObjectURL(await response.blob())
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = item.fileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export async function withdrawCloudFile(token: string, id: string, reason: string): Promise<void> {
  let response: Response
  try {
    response = await fetch(endpoint(`/veto/files/${encodeURIComponent(id)}/withdraw`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept-Language': getLocale() },
      body: JSON.stringify({ reason })
    })
  } catch {
    throw new CloudFileError(t('services_cloud_unavailable'))
  }
  if (!response.ok) throw await responseError(response, t('services_file_withdraw'))
}

export function reviewCloudFile(token: string, id: string, decision: 'approve' | 'reject',
  note: string, visibility?: FileVisibility): Promise<{ ok: true; file: FileContent }> {
  return request(token, `/veto/files/${encodeURIComponent(id)}/${decision}`, {
    method: 'POST', body: JSON.stringify({ note, ...(visibility ? { visibility } : {}) })
  }, t('services_file_review'))
}

export function cancelCloudFile(token: string, id: string): Promise<{ ok: true }> {
  return request(token, `/veto/files/${encodeURIComponent(id)}/cancel`, { method: 'POST' }, t('services_file_cancel'))
}

export function requestFileVisibility(token: string, id: string, visibility: FileVisibility): Promise<{ ok: true }> {
  return request(token, `/veto/files/${encodeURIComponent(id)}/visibility`, {
    method: 'POST', body: JSON.stringify({ visibility })
  }, t('services_visibility_change'))
}

export function decideFileVisibility(token: string, requestId: string, decision: 'approve' | 'reject', note: string): Promise<{ ok: true }> {
  return request(token, `/veto/files/visibility-requests/${encodeURIComponent(requestId)}/${decision}`, {
    method: 'POST', body: JSON.stringify({ note })
  }, t('services_visibility_review'))
}
