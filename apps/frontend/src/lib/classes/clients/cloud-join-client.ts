import { t, getLocale } from '$lib/i18n'

const cloudApiBaseUrl = (
  import.meta.env.VITE_CLOUD_API_URL ?? 'https://api.miaoyww.top/v1'
).replace(/\/$/, '')

const CLOUD_SEAT_SESSION_KEY = 'veto.cloud-seat-session'

export type CloudSeatState = 'unclaimed' | 'claimed'

export interface CloudJoinTarget {
  inviteCode: string
  conferenceId: string
  conferenceName: string
  organizer: string
  committeeId: string
  committeeName: string
  committeeType: 'cabinet' | 'mpc' | 'ipc'
  seatId: string
  seatName: string
  seatShortName: string
  roleTemplateId: string
  roleName: string
  capabilities: string[]
  chair?: CloudChairProjection | null
  seatState: CloudSeatState
  hasPassword: boolean
  wsUrl: string
}

export interface CloudClaimInput {
  inviteCode: string
  displayName: string
  password?: string
}

export interface CloudAuthenticateInput {
  inviteCode: string
  password?: string
}

export interface CloudJoinIdentity {
  userId: string
  displayName: string
  conferenceId: string
  committeeId: string
  seatId: string
  roleTemplateId: string
  roleName: string
  capabilities: string[]
  isChair: boolean
}

export interface CloudClaimResult extends CloudJoinTarget {
  token: string
  isChair: boolean
  identity: CloudJoinIdentity
}

/** Committee projection derived solely from the Seat's control_conference capability. */
export interface CloudChairProjection {
  committeeId: string
  committeeName: string
}

export interface CloudChairUser {
  id: string
  displayName: string
}

export interface CloudChairSeat {
  id: string
  name: string
  shortName?: string
  roleTemplateId: string
  roleName: string
  hasVotingRights: boolean
  hasVetoPower?: boolean
  user: CloudChairUser | null
}

export interface CloudChairCommittee {
  conference: {
    id: string
    name: string
    organizer: string
  }
  committee: {
    id: string
    name: string
    type: 'cabinet' | 'mpc' | 'ipc'
  }
  chairSeat: {
    id: string
    name: string
    shortName?: string
    roleTemplateId: string
    roleName: string
    capabilities: string[]
    user: CloudChairUser | null
  }
  seats: CloudChairSeat[]
}

export interface CloudSeatSession {
  result: CloudClaimResult
  connectedAt: number
}

export class CloudJoinError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'CloudJoinError'
    this.status = status
  }
}

export function normalizeInviteCode(value: string): string {
  const characters = value.trim().toUpperCase().replaceAll(/[\s-]/g, '')
  if (!/^[A-HJ-NP-Z2-9]{12}$/.test(characters)) {
    throw new CloudJoinError(t('services_invite_format'))
  }

  return [characters.slice(0, 4), characters.slice(4, 8), characters.slice(8)].join('-')
}

function responseError(payload: unknown, fallback: string): string {
  if (typeof payload === 'object' && payload !== null) {
    if ('message' in payload && typeof payload.message === 'string') return payload.message
    if (
      'error' in payload &&
      typeof payload.error === 'object' &&
      payload.error !== null &&
      'message' in payload.error &&
      typeof payload.error.message === 'string'
    ) {
      return payload.error.message
    }
  }

  return fallback
}

async function request<T>(path: string, body: unknown): Promise<T> {
  if (!cloudApiBaseUrl) {
    throw new CloudJoinError(t('services_cloud_unconfigured'))
  }

  let response: Response
  try {
    response = await fetch(new URL(path.replace(/^\//, ''), `${cloudApiBaseUrl}/`), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Accept-Language': getLocale() },
      body: JSON.stringify(body)
    })
  } catch {
    throw new CloudJoinError(t('services_cloud_unavailable'))
  }

  const payload = (await response.json().catch(() => null)) as T | unknown | null
  if (!response.ok) {
    throw new CloudJoinError(responseError(payload, t('services_cloud_request_failed')), response.status)
  }

  return payload as T
}

export function validateCloudInvite(inviteCode: string): Promise<CloudJoinTarget> {
  return request<CloudJoinTarget>('/veto/join/validate', {
    inviteCode: normalizeInviteCode(inviteCode)
  })
}

export function claimCloudSeat(input: CloudClaimInput): Promise<CloudClaimResult> {
  return request<CloudClaimResult>('/veto/join/claim', {
    ...input,
    inviteCode: normalizeInviteCode(input.inviteCode)
  })
}

export function authenticateCloudSeat(input: CloudAuthenticateInput): Promise<CloudClaimResult> {
  return request<CloudClaimResult>('/veto/join/authenticate', {
    ...input,
    inviteCode: normalizeInviteCode(input.inviteCode)
  })
}

export async function getCloudChairCommittee(token: string): Promise<CloudChairCommittee> {
  if (!cloudApiBaseUrl) throw new CloudJoinError(t('services_cloud_unconfigured'))

  let response: Response
  try {
    response = await fetch(new URL('veto/chair/committee', `${cloudApiBaseUrl}/`), {
      headers: { authorization: `Bearer ${token}`, 'Accept-Language': getLocale() }
    })
  } catch {
    throw new CloudJoinError(t('services_cloud_unavailable'))
  }
  const payload = (await response.json().catch(() => null)) as CloudChairCommittee | unknown | null
  if (!response.ok) {
    throw new CloudJoinError(responseError(payload, t('services_chair_failed')), response.status)
  }
  return payload as CloudChairCommittee
}

export function saveCloudSeatSession(result: CloudClaimResult): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(
    CLOUD_SEAT_SESSION_KEY,
    JSON.stringify({ result, connectedAt: Date.now() } satisfies CloudSeatSession)
  )
}

export function getCloudSeatSession(): CloudSeatSession | null {
  if (typeof sessionStorage === 'undefined') return null

  try {
    const value = JSON.parse(sessionStorage.getItem(CLOUD_SEAT_SESSION_KEY) ?? 'null') as unknown
    if (!value || typeof value !== 'object' || !('result' in value) || !('connectedAt' in value)) {
      return null
    }
    return value as CloudSeatSession
  } catch {
    return null
  }
}
