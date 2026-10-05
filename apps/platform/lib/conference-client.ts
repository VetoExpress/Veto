import { clearApiCache, readApiCache, writeApiCache } from "./api-cache"

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "")

export const CAPABILITIES = [
  "view_conference",
  "view_news",
  "view_situation",
  "view_files",
  "review_files",
  "draft_news",
  "review_news",
  "submit_directive",
  "process_directive",
  "send_files",
  "publish_situation",
  "withdraw_news",
  "withdraw_situation",
  "withdraw_files",
  "control_conference",
  "control_timeline",
  "draft_resolution",
] as const

export type Capability = (typeof CAPABILITIES)[number]
export type CommitteeType = "cabinet" | "mpc" | "ipc"
export type SystemRoleCode = "staff" | "mpc_press" | "ipc"

export const CAPABILITY_LABELS: Record<Capability, string> = {
  view_conference: "查看会议状态",
  view_news: "查看全局新闻",
  view_situation: "查看全局局势",
  view_files: "查看文件",
  review_files: "审核文件",
  draft_news: "起草新闻草稿",
  review_news: "审核新闻",
  submit_directive: "提交指令",
  process_directive: "处理指令",
  send_files: "发送文件",
  publish_situation: "发布局势更新",
  withdraw_news: "撤回新闻",
  withdraw_situation: "撤回局势更新",
  withdraw_files: "撤回文件",
  control_conference: "控制会议流程",
  control_timeline: "控制大会时间线",
  draft_resolution: "起草决议",
}

export interface CapabilityGroup {
  id: string
  label: string
  capabilities: readonly Capability[]
}

export const CAPABILITY_GROUPS: CapabilityGroup[] = [
  {
    id: "view",
    label: "查看",
    capabilities: [
      "view_conference",
      "view_news",
      "view_situation",
      "view_files",
    ],
  },
  {
    id: "content",
    label: "文件与新闻",
    capabilities: [
      "draft_news",
      "review_news",
      "send_files",
      "review_files",
      "draft_resolution",
    ],
  },
  {
    id: "directive",
    label: "指令",
    capabilities: ["submit_directive", "process_directive"],
  },
  {
    id: "publish",
    label: "发布与撤回",
    capabilities: [
      "publish_situation",
      "withdraw_news",
      "withdraw_situation",
      "withdraw_files",
    ],
  },
  {
    id: "control",
    label: "会议控制",
    capabilities: ["control_conference", "control_timeline"],
  },
]

export interface ConferenceSummary {
  id: string
  mode: "conference"
  name: string
  description?: string
  organizer?: string
  startsAt?: string | null
  endsAt?: string | null
  filesExpireAt?: string | null
  filesExpiredAt?: string | null
  version: number
  lifecycle: "draft" | "active" | "closed"
  timezone: string
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

export interface RoleTemplateInput {
  id?: string
  clientId?: string
  name: string
  description?: string
  systemCode?: SystemRoleCode
  capabilities: Capability[]
  builtIn?: boolean
}

export interface SeatInput {
  id?: string
  clientId?: string
  name: string
  shortName?: string
  roleTemplateId: string
  hasVotingRights: boolean
  inviteCode?: string
  inviteActive?: boolean
}

export interface AgendaItemInput {
  id?: string
  clientId?: string
  title: string
  description?: string
}

export interface CommitteeInput {
  id?: string
  clientId?: string
  name: string
  type: CommitteeType
  seats: SeatInput[]
  agenda: AgendaItemInput[]
}

export interface Conference extends ConferenceSummary {
  timelineMode: "undecided" | "none" | "configured"
  timeline: {
    id: string
    name: string
    initialSimTime: number
    simulationAnchor: number
    realAnchor: number
    ratio: number
    paused: boolean
    pausedSimTime: number | null
    version: number
  } | null
  roleTemplates: RoleTemplateInput[]
  committees: CommitteeInput[]
}

export interface ConferenceStructure {
  roleTemplates: RoleTemplateInput[]
  committees: CommitteeInput[]
}

export interface CreateConferenceInput extends ConferenceStructure {
  name: string
  description?: string
  organizer?: string
  startsAt: string
  endsAt: string
}

export interface SeatCommitteeUser {
  id: string
  displayName: string
}

export interface OrganizerSeatAccess {
  seatId: string
  committeeId: string
  user: { id: string; displayName: string; claimedAt: string } | null
}

export async function listOrganizerSeatAccess(token: string, id: string): Promise<OrganizerSeatAccess[]> {
  const result = await apiRequest<{ ok: true; seats: OrganizerSeatAccess[] }>(token, `${conferencePath(id)}/seat-access`, { refreshCache: true, cache: "no-store" })
  return result.seats
}

export async function resetOrganizerSeatUser(token: string, id: string, seatId: string, userId: string, reason: string): Promise<void> {
  await apiRequest(token, `${conferencePath(id)}/seats/${encodeURIComponent(seatId)}/reset-user`, { method: "POST", body: JSON.stringify({ userId, reason }) })
}

export interface SeatCommitteeSession {
  ok: true
  conference: {
    id: string
    name: string
    organizer: string
    startsAt?: string | null
    endsAt?: string | null
    filesExpireAt?: string | null
  }
  committee: {
    id: string
    name: string
    type: CommitteeType
  }
  seat: {
    id: string
    name: string
    shortName?: string
    roleTemplateId: string
    roleName: string
    capabilities: Capability[]
    hasVotingRights: boolean
  }
  user: SeatCommitteeUser | null
  chair: {
    committeeId: string
  } | null
  isChair: boolean
}

interface ApiFieldError {
  path: string
  code: string
  message: string
}

interface ApiErrorBody {
  ok: false
  error: {
    code: string
    message: string
    fields?: ApiFieldError[]
  }
}

type ApiRequestInit = RequestInit & { refreshCache?: boolean }

const pendingGetRequests = new Map<string, Promise<unknown>>()

export class ConferenceApiError extends Error {
  readonly status?: number
  readonly code?: string
  readonly fields: ApiFieldError[]

  constructor(
    message: string,
    options: { status?: number; code?: string; fields?: ApiFieldError[] } = {}
  ) {
    super(message)
    this.name = "ConferenceApiError"
    this.status = options.status
    this.code = options.code
    this.fields = options.fields ?? []
  }
}

async function apiRequest<T>(
  token: string,
  path: string,
  init: ApiRequestInit = {}
): Promise<T> {
  if (!apiBaseUrl) {
    throw new ConferenceApiError("API 服务暂未配置")
  }

  const method = (init.method ?? "GET").toUpperCase()
  const isGet = method === "GET"
  const shouldCache = isGet && !init.refreshCache
  const cacheKey = `${token}\u0000${path}`

  if (shouldCache) {
    const cached = readApiCache<T>(token, path)
    if (cached !== undefined) return cached

    const pending = pendingGetRequests.get(cacheKey)
    if (pending) return pending as Promise<T>
  }

  if (!isGet) clearApiCache()

  const request = (async (): Promise<T> => {
    const headers = new Headers(init.headers)
    headers.set("Authorization", `Bearer ${token}`)
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json")
    }

    let response: Response
    try {
      response = await fetch(
        new URL(path.replace(/^\//, ""), `${apiBaseUrl}/`),
        {
          ...init,
          headers,
        }
      )
    } catch {
      throw new ConferenceApiError("无法连接大会服务")
    }

    const payload = (await response.json().catch(() => null)) as
      T | ApiErrorBody | null

    if (!response.ok) {
      const error =
        payload && typeof payload === "object" && "error" in payload
          ? payload.error
          : undefined
      throw new ConferenceApiError(error?.message ?? "请求失败", {
        status: response.status,
        code: error?.code,
        fields: error?.fields,
      })
    }

    if (shouldCache && payload !== null) {
      writeApiCache(token, path, payload)
    }

    return payload as T
  })()

  if (shouldCache) {
    pendingGetRequests.set(cacheKey, request)
    try {
      return await request
    } finally {
      pendingGetRequests.delete(cacheKey)
    }
  }

  return request
}

function conferencePath(id: string): string {
  return `/v1/conferences/${encodeURIComponent(id)}`
}

function cacheConference(token: string, conference: Conference): void {
  writeApiCache(token, conferencePath(conference.id), {
    ok: true,
    conference,
  })
}

export async function listConferences(
  token: string,
  options: {
    status?: "active" | "deleted"
    cursor?: string
    limit?: number
    refresh?: boolean
  } = {}
): Promise<{ conferences: ConferenceSummary[]; nextCursor: string | null }> {
  const query = new URLSearchParams({
    status: options.status ?? "active",
    limit: String(options.limit ?? 20),
  })
  if (options.cursor) query.set("cursor", options.cursor)
  return apiRequest(token, `/v1/conferences?${query}`, {
    refreshCache: options.refresh,
  })
}

export async function getConference(
  token: string,
  id: string,
  options: { refresh?: boolean } = {}
): Promise<Conference> {
  const result = await apiRequest<{ ok: true; conference: Conference }>(
    token,
    conferencePath(id),
    { refreshCache: options.refresh }
  )
  return result.conference
}

export async function createConference(
  token: string,
  input: CreateConferenceInput,
  idempotencyKey: string
): Promise<Conference> {
  const result = await apiRequest<{ ok: true; conference: Conference }>(
    token,
    "/v1/conferences",
    {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(input),
    }
  )
  cacheConference(token, result.conference)
  return result.conference
}

export async function updateConferenceMetadata(
  token: string,
  id: string,
  version: number,
  input: {
    name?: string
    description?: string
    organizer?: string
    startsAt?: string
    endsAt?: string
  }
): Promise<Conference> {
  const result = await apiRequest<{ ok: true; conference: Conference }>(
    token,
    `/v1/conferences/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "If-Match": `"${version}"` },
      body: JSON.stringify(input),
    }
  )
  cacheConference(token, result.conference)
  return result.conference
}

export async function replaceConferenceStructure(
  token: string,
  id: string,
  version: number,
  structure: ConferenceStructure
): Promise<Conference> {
  const result = await apiRequest<{ ok: true; conference: Conference }>(
    token,
    `/v1/conferences/${encodeURIComponent(id)}/structure`,
    {
      method: "PUT",
      headers: { "If-Match": `"${version}"` },
      body: JSON.stringify(structure),
    }
  )
  cacheConference(token, result.conference)
  return result.conference
}

export const CONFERENCE_LIFECYCLE_LABELS: Record<
  ConferenceSummary["lifecycle"],
  string
> = {
  draft: "草稿",
  active: "进行中",
  closed: "已结束",
}

export async function configureConferenceRuntime(
  token: string,
  id: string,
  version: number,
  timeline: null | { name: string; initialSimTime: number; ratio: number }
): Promise<Conference> {
  const result = await apiRequest<{ ok: true; conference: Conference }>(
    token,
    `${conferencePath(id)}/runtime`,
    {
      method: "PUT",
      headers: { "If-Match": `"${version}"` },
      body: JSON.stringify({ timeline }),
    }
  )
  cacheConference(token, result.conference)
  return result.conference
}

export async function activateConference(
  token: string,
  id: string,
  version: number
): Promise<Conference> {
  const result = await apiRequest<{ ok: true; conference: Conference }>(
    token,
    `${conferencePath(id)}/activate`,
    { method: "POST", headers: { "If-Match": `"${version}"` } }
  )
  cacheConference(token, result.conference)
  return result.conference
}

export interface OrganizerSituation {
  id: string
  content: string
  contentTime: number
  status: "published" | "withdrawn"
  publishedAt: string
  withdrawnAt?: string
  withdrawalReason?: string
  author: { committeeName: string; seatName: string; role?: string }
}

export async function listOrganizerSituations(
  token: string,
  id: string,
  refresh = false
): Promise<{ timezone: string; situations: OrganizerSituation[] }> {
  return apiRequest(token, `${conferencePath(id)}/situations`, {
    refreshCache: refresh,
  })
}

export async function withdrawOrganizerSituation(
  token: string,
  conferenceId: string,
  situationId: string,
  reason: string
): Promise<void> {
  await apiRequest(
    token,
    `${conferencePath(conferenceId)}/situations/${encodeURIComponent(situationId)}/withdraw`,
    { method: "POST", body: JSON.stringify({ reason }) }
  )
}

export interface OrganizerNews {
  id: string
  source: string
  title: string
  content: string
  contentTime: number
  status: "submitted" | "rejected" | "published" | "withdrawn"
  revision: number
  reviewNote?: string
  publishedAt?: string
  withdrawnAt?: string
  withdrawalReason?: string
  createdAt: string
  author: { committeeName: string; seatName: string; role?: string }
}

export async function listOrganizerNews(
  token: string,
  id: string,
  refresh = false
): Promise<{ ok: true; timezone: string; news: OrganizerNews[] }> {
  return apiRequest(token, `${conferencePath(id)}/news`, {
    refreshCache: refresh,
  })
}

export async function withdrawOrganizerNews(
  token: string,
  conferenceId: string,
  newsId: string,
  reason: string
): Promise<void> {
  await apiRequest(
    token,
    `${conferencePath(conferenceId)}/news/${encodeURIComponent(newsId)}/withdraw`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    }
  )
}

export interface OrganizerFile {
  id: string
  sourceCommitteeId: string
  sourceSeatId: string
  title: string
  fileType: string
  agendaItem?: string
  fileName: string
  mimeType: string
  size: number
  status: "submitted" | "published" | "rejected" | "cancelled" | "withdrawn"
  objectDeletedAt?: string | null
  requestedVisibility: "committee" | "conference"
  visibility: "committee" | "conference"
  replacesFileId?: string
  reviewedAt?: string
  reviewNote?: string
  publishedAt?: string
  cancelledAt?: string
  createdAt: string
  withdrawnAt?: string
  withdrawalReason?: string
  author: { committeeName: string; seatName: string; role?: string }
}

export async function listOrganizerFiles(
  token: string,
  id: string,
  refresh = false,
  fileType?: string
): Promise<{ ok: true; files: OrganizerFile[] }> {
  const query = fileType ? `?${new URLSearchParams({ fileType })}` : ""
  return apiRequest(token, `${conferencePath(id)}/files${query}`, {
    refreshCache: refresh,
  })
}

export function listOrganizerFileTypes(
  token: string,
  id: string,
  refresh = false
): Promise<{ ok: true; fileTypes: string[] }> {
  return apiRequest(token, `${conferencePath(id)}/files/types`, {
    refreshCache: refresh,
  })
}

export async function closeConference(
  token: string,
  id: string,
  version: number
): Promise<Conference> {
  const result = await apiRequest<{ ok: true; conference: Conference }>(
    token,
    `${conferencePath(id)}/close`,
    {
      method: "POST",
      headers: { "If-Match": `"${version}"` },
    }
  )
  cacheConference(token, result.conference)
  return result.conference
}

export async function withdrawOrganizerFile(
  token: string,
  conferenceId: string,
  fileId: string,
  reason: string
): Promise<void> {
  await apiRequest(
    token,
    `${conferencePath(conferenceId)}/files/${encodeURIComponent(fileId)}/withdraw`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    }
  )
}

export async function downloadOrganizerFile(
  token: string,
  conferenceId: string,
  file: OrganizerFile
): Promise<void> {
  if (!apiBaseUrl) throw new ConferenceApiError("API 服务暂未配置")
  let response: Response
  try {
    response = await fetch(
      new URL(
        `${conferencePath(conferenceId)}/files/${encodeURIComponent(file.id)}/download`.replace(
          /^\//,
          ""
        ),
        `${apiBaseUrl}/`
      ),
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    )
  } catch {
    throw new ConferenceApiError("无法连接大会服务")
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string; code?: string }
    } | null
    throw new ConferenceApiError(payload?.error?.message ?? "下载文件失败", {
      status: response.status,
      code: payload?.error?.code,
    })
  }
  const url = URL.createObjectURL(await response.blob())
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = file.fileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export interface OrganizerDirective {
  id: string
  sourceCommitteeId: string
  sourceSeatId: string
  targetCommitteeId: string
  targetCommitteeName: string
  title: string
  content: string
  status: "submitted" | "processing" | "approved" | "rejected" | "cancelled"
  revision: number
  claimedBySeatId?: string
  claimedAt?: string
  processingNote?: string
  decidedAt?: string
  createdAt: string
  author: { committeeName: string; seatName: string; role?: string }
}

export async function listOrganizerDirectives(
  token: string,
  id: string,
  refresh = false
): Promise<{ ok: true; directives: OrganizerDirective[] }> {
  return apiRequest(token, `${conferencePath(id)}/directives`, {
    refreshCache: refresh,
  })
}

export async function releaseOrganizerDirective(
  token: string,
  conferenceId: string,
  directiveId: string,
  reason: string
): Promise<void> {
  await apiRequest(
    token,
    `${conferencePath(conferenceId)}/directives/${encodeURIComponent(directiveId)}/release`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    }
  )
}

export async function deleteConference(
  token: string,
  id: string,
  version: number
): Promise<void> {
  await apiRequest(token, conferencePath(id), {
    method: "DELETE",
    headers: { "If-Match": `"${version}"` },
  })
}

export async function restoreConference(
  token: string,
  id: string,
  version: number
): Promise<Conference> {
  const result = await apiRequest<{ ok: true; conference: Conference }>(
    token,
    `${conferencePath(id)}/restore`,
    {
      method: "POST",
      headers: { "If-Match": `"${version}"` },
    }
  )
  cacheConference(token, result.conference)
  return result.conference
}

export async function getCommitteeBySeat(
  seatToken: string,
  conferenceId: string,
  committeeId: string,
  options: { refresh?: boolean } = {}
): Promise<SeatCommitteeSession> {
  return apiRequest<SeatCommitteeSession>(
    seatToken,
    `/v1/veto/committee/${encodeURIComponent(conferenceId)}/${encodeURIComponent(
      committeeId
    )}`,
    { refreshCache: options.refresh }
  )
}
