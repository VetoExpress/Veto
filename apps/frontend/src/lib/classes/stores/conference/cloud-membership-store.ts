import { get } from 'svelte/store'

import {
  CloudJoinError,
  type CloudChairCommittee,
  type CloudClaimResult
} from '$lib/classes/clients/cloud-join-client'
import { Conference } from '$lib/classes/domain/conference.svelte'
import {
  conferences,
  reconcileCommitteeSeats
} from '$lib/classes/stores/conference/conference-store'
import type { Capability, Seat, SeatAccess, User } from '$lib/classes/types/delegate'
import type { RoleTemplate } from '$lib/classes/types/event'
import type {
  Committee as CommitteeDTO,
  Conference as ConferenceDTO
} from '$lib/classes/types/conference'

const CLOUD_MEMBERSHIPS_KEY = 'veto.cloud-memberships'
const CLOUD_ENCRYPTION_KEY = 'veto.cloud-membership-key'
const ENCRYPTION_ALGORITHM = 'AES-GCM'

interface EncryptedValue {
  ciphertext: string
  iv: string
}

export interface CloudMembership {
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
  isChair: boolean
  chairCommitteeId?: string
  chairCommitteeName?: string
  userId: string
  displayName: string
  hasPassword: boolean
  password?: EncryptedValue
  createdAt: number
  updatedAt: number
}

let encryptionKeyPromise: Promise<CryptoKey> | null = null

function toBase64(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string): ArrayBuffer {
  const binary = atob(value)
  const buffer = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buffer)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return buffer
}

async function loadEncryptionKey(): Promise<CryptoKey> {
  if (typeof crypto === 'undefined' || !crypto.subtle || typeof localStorage === 'undefined') {
    throw new CloudJoinError('当前环境不支持本地安全存储')
  }

  const storedKey = localStorage.getItem(CLOUD_ENCRYPTION_KEY)
  const usages: KeyUsage[] = ['encrypt', 'decrypt']

  if (storedKey) {
    try {
      const keyData = JSON.parse(storedKey) as JsonWebKey
      return await crypto.subtle.importKey('jwk', keyData, ENCRYPTION_ALGORITHM, true, usages)
    } catch {
      localStorage.removeItem(CLOUD_ENCRYPTION_KEY)
    }
  }

  const key = (await crypto.subtle.generateKey(
    { name: ENCRYPTION_ALGORITHM, length: 256 },
    true,
    usages
  )) as CryptoKey
  const exportedKey = await crypto.subtle.exportKey('jwk', key)
  localStorage.setItem(CLOUD_ENCRYPTION_KEY, JSON.stringify(exportedKey))
  return key
}

function getEncryptionKey(): Promise<CryptoKey> {
  if (!encryptionKeyPromise) {
    encryptionKeyPromise = loadEncryptionKey().catch((error: unknown) => {
      encryptionKeyPromise = null
      throw error
    })
  }

  return encryptionKeyPromise
}

async function encryptLocalValue(value: string): Promise<EncryptedValue> {
  const key = await getEncryptionKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: ENCRYPTION_ALGORITHM, iv },
    key,
    new TextEncoder().encode(value)
  )

  return {
    ciphertext: toBase64(ciphertext),
    iv: toBase64(iv)
  }
}

async function decryptLocalValue(value: EncryptedValue): Promise<string | null> {
  try {
    const key = await getEncryptionKey()
    const plaintext = await crypto.subtle.decrypt(
      { name: ENCRYPTION_ALGORITHM, iv: fromBase64(value.iv) },
      key,
      fromBase64(value.ciphertext)
    )
    return new TextDecoder().decode(plaintext)
  } catch {
    return null
  }
}

function loadMemberships(): CloudMembership[] {
  if (typeof localStorage === 'undefined') return []

  try {
    const value = JSON.parse(localStorage.getItem(CLOUD_MEMBERSHIPS_KEY) ?? '[]') as unknown
    return Array.isArray(value) ? (value as CloudMembership[]) : []
  } catch {
    return []
  }
}

function saveMemberships(memberships: CloudMembership[]): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(CLOUD_MEMBERSHIPS_KEY, JSON.stringify(memberships))
}

function membershipFromResult(result: CloudClaimResult): CloudMembership {
  const now = Date.now()

  return {
    inviteCode: result.inviteCode,
    conferenceId: result.conferenceId,
    conferenceName: result.conferenceName,
    organizer: result.organizer,
    committeeId: result.committeeId,
    committeeName: result.committeeName,
    committeeType: result.committeeType,
    seatId: result.seatId,
    seatName: result.seatName,
    seatShortName: result.seatShortName,
    roleTemplateId: result.roleTemplateId,
    roleName: result.roleName,
    capabilities: [...result.capabilities],
    isChair: result.isChair,
    chairCommitteeId: result.chair?.committeeId,
    chairCommitteeName: result.chair?.committeeName,
    userId: result.identity.userId,
    displayName: result.identity.displayName,
    hasPassword: result.hasPassword,
    createdAt: now,
    updatedAt: now
  }
}

function toConferenceDTO(membership: CloudMembership): ConferenceDTO {
  const seatGroupId = `${membership.committeeId}:group`
  const roleTemplate: RoleTemplate = {
    id: membership.roleTemplateId,
    name: membership.roleName,
    capabilities: membership.capabilities as Capability[]
  }
  const seat: Seat = {
    id: membership.seatId,
    name: membership.seatName,
    shortName: membership.seatShortName,
    seatGroupId,
    userId: membership.userId,
    capabilityOverrides: {},
    role: membership.roleName,
    roleId: membership.roleTemplateId,
    procedure:
      membership.committeeType === 'cabinet'
        ? {
            attendance: 'absent',
            hasVotingRights: true,
            sortOrder: 0
          }
        : undefined
  }
  const user: User = { id: membership.userId, name: membership.displayName }
  const seatAccess: SeatAccess = {
    seatId: membership.seatId,
    inviteCode: membership.inviteCode
  }
  const committee: CommitteeDTO = {
    id: membership.committeeId,
    name: membership.committeeName,
    phase: 'preamble',
    agenda: [],
    speakerLists: { id: 'main', name: '主发言名单', entries: [] },
    motions: [],
    dismissedResolvedMotionIds: [],
    points: [],
    dismissedPointIds: [],
    draftResolutions: [],
    documentNames: [],
    votingSessions: [],
    minutes: [],
    defaultSpeakingTimeSec: 120,
    caucusSetup: null,
    seats: [seat]
  }

  return {
    id: membership.conferenceId,
    name: membership.conferenceName,
    source: 'cloud',
    description: membership.isChair ? '云端主席席位' : membership.roleName,
    organizer: membership.organizer,
    createdAt: membership.createdAt,
    updatedAt: membership.updatedAt,
    committees: [committee],
    users: [user],
    seatAccesses: [seatAccess],
    roleTemplates: [roleTemplate],
    seatGroups: [
      {
        id: seatGroupId,
        name: membership.committeeName,
        type: membership.committeeType,
        defaultCapabilities: membership.capabilities as Capability[],
        sortOrder: 0
      }
    ],
    news: [],
    situationUpdates: []
  }
}

function ensureCloudConference(membership: CloudMembership): void {
  conferences.update((list) => {
    const existing = list.find((conference) => conference.id === membership.conferenceId)
    const data = toConferenceDTO(membership)
    if (!existing) return [...list, Conference.fromJSON(data)]
    if (existing.getCommittee(membership.committeeId)) return list

    // One conference can be entered through seats in different committees.
    // Add the missing context without replacing any local procedure state.
    existing.addCommittee(data.committees[0])
    for (const group of data.seatGroups ?? []) {
      if (!existing.seatGroups.some((item) => item.id === group.id)) existing.addSeatGroup(group)
    }
    existing.setRoleTemplates([
      ...existing.roleTemplates,
      ...(data.roleTemplates ?? []).filter(
        (role) => !existing.roleTemplates.some((item) => item.id === role.id)
      )
    ])
    existing.setUsers([
      ...existing.users,
      ...(data.users ?? []).filter((user) => !existing.users.some((item) => item.id === user.id))
    ])
    existing.setSeatAccesses([
      ...existing.seatAccesses,
      ...(data.seatAccesses ?? []).filter(
        (access) => !existing.seatAccesses.some((item) => item.seatId === access.seatId)
      )
    ])
    return [...list]
  })
}

/** Apply the authorized Chair roster while keeping procedure runtime state local. */
export function applyCloudChairProjection(projection: CloudChairCommittee): void {
  const seatGroupId = `${projection.committee.id}:group`
  const participantSeats: Seat[] = projection.seats
    .filter((seat) => seat.id !== projection.chairSeat.id)
    .map((seat, sortOrder) => ({
      id: seat.id,
      name: seat.name,
      shortName: seat.shortName,
      seatGroupId,
      userId: seat.user?.id,
      capabilityOverrides: {},
      role: seat.roleName,
      roleId: seat.roleTemplateId,
      procedure:
        projection.committee.type === 'cabinet'
          ? {
              attendance: 'absent',
              hasVotingRights: seat.hasVotingRights,
              sortOrder
            }
          : undefined
    }))

  reconcileCommitteeSeats(projection.conference.id, projection.committee.id, participantSeats)
}

export async function rememberCloudMembership(
  result: CloudClaimResult,
  password?: string
): Promise<CloudMembership> {
  const memberships = loadMemberships()
  const existing = memberships.find(
    (membership) =>
      membership.conferenceId === result.conferenceId && membership.seatId === result.seatId
  )
  const currentPassword =
    password !== undefined ? password : existing ? await getCloudMembershipPassword(existing) : null
  const encryptedPassword = currentPassword ? await encryptLocalValue(currentPassword) : undefined
  const nextMembership: CloudMembership = existing
    ? {
        ...existing,
        ...membershipFromResult(result),
        createdAt: existing.createdAt,
        password: encryptedPassword
      }
    : {
        ...membershipFromResult(result),
        password: encryptedPassword
      }

  saveMemberships(
    [
      ...memberships.filter(
        (membership) =>
          membership.conferenceId !== result.conferenceId || membership.seatId !== result.seatId
      ),
      nextMembership
    ].sort((left, right) => right.updatedAt - left.updatedAt)
  )
  ensureCloudConference(nextMembership)

  return nextMembership
}

export async function updateCloudMembershipPassword(
  membership: CloudMembership,
  password: string
): Promise<CloudMembership> {
  const nextMembership: CloudMembership = {
    ...membership,
    password: await encryptLocalValue(password),
    updatedAt: Date.now()
  }
  saveMemberships(
    loadMemberships().map((item) =>
      item.conferenceId === membership.conferenceId && item.seatId === membership.seatId
        ? nextMembership
        : item
    )
  )
  ensureCloudConference(nextMembership)

  return nextMembership
}

/** All locally remembered seats for a cloud conference, most recently used first. */
export function getCloudMembershipsByConferenceId(conferenceId: string): CloudMembership[] {
  return loadMemberships().filter((membership) => membership.conferenceId === conferenceId)
}

/** Remove every locally remembered seat for a cloud conference. */
export function removeCloudMembership(conferenceId: string): void {
  saveMemberships(
    loadMemberships().filter((membership) => membership.conferenceId !== conferenceId)
  )
}

export function getCloudMembershipByInviteCode(inviteCode: string): CloudMembership | null {
  return (
    loadMemberships().find(
      (membership) => membership.inviteCode.toUpperCase() === inviteCode.trim().toUpperCase()
    ) ?? null
  )
}

export async function getCloudMembershipPassword(
  membership: CloudMembership
): Promise<string | null> {
  return membership.password ? decryptLocalValue(membership.password) : null
}
