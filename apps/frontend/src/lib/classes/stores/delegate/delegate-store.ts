/**
 * delegate-store.ts — 代表端状态管理
 *
 * 薄包装层，遵循 conference-store.ts 的引擎代理模式。
 * - 读写 delegate 相关数据（指令、新闻、局势更新）
 * - 席位、席位组管理
 * - 模式切换
 * - 通过 delegate-bridge 同步到代表端
 */

import { derived, get } from 'svelte/store'
import type { SeatGroup, Seat, Capability, CabinetMode } from '$lib/classes/types/delegate'
import {
  conferences,
  currentConferenceRecord,
  currentCommittee,
  syncCurrentCommittee
} from '../conference/conference-store'
import { generateInviteCode } from '$lib/classes/services/seat-access'

// ---- 辅助：获取当前引擎 -------------------------------------------------

function getEng() {
  const engine = get(currentCommittee)
  if (!engine) {
    console.warn('[delegate-store] No current engine')
    return null
  }
  return engine
}

// ---- 席位组 ---------------------------------------------------------------

export const seatGroups = derived(currentConferenceRecord, ($conference) => $conference?.seatGroups ?? [])

export function addSeatGroup(name: string, type: SeatGroup['type'], defaultCapabilities: Capability[] = []): string {
  const conference = get(currentConferenceRecord)
  if (!conference) return ''
  const id = crypto.randomUUID()
  conference.addSeatGroup({
    id,
    name,
    type,
    defaultCapabilities,
    sortOrder: conference.seatGroups.length
  })
  conferences.update((items) => [...items])
  return id
}

function updateCurrentConference(updater: (conference: NonNullable<ReturnType<typeof getCurrentConference>>) => void): void {
  const conference = getCurrentConference()
  if (!conference) return
  updater(conference)
  conferences.update((items) => [...items])
}

function getCurrentConference() {
  return get(currentConferenceRecord)
}

export function updateSeatGroup(id: string, updates: Partial<SeatGroup>): void {
  const conference = get(currentConferenceRecord)
  if (!conference) return
  conference.updateSeatGroup(id, updates)
  conferences.update((items) => [...items])
}

// ---- 席位 -----------------------------------------------------------------

export const seats = derived(currentCommittee, ($engine) => $engine?.seats ?? [])

export function addSeat(
  name: string,
  seatGroupId: string,
  roleId?: string,
  capabilityOverrides: Partial<Record<Capability, boolean>> = {}
): string {
  const engine = getEng()
  const conference = get(currentConferenceRecord)
  if (!engine || !conference) return ''
  const group = conference.seatGroups.find((item) => item.id === seatGroupId)
  const role = conference.roleTemplates.find((item) => item.id === roleId)
  const procedure = group?.type === 'cabinet'
    ? {
        attendance: 'absent' as const,
        hasVotingRights: true,
        isReferenceGroup: true,
        sortOrder: engine.participantSeats.length
      }
    : undefined
  const id = engine.addSeat(
    name,
    seatGroupId,
    role?.name,
    { ...Object.fromEntries((role?.capabilities ?? []).map((capability) => [capability, true])), ...capabilityOverrides },
    procedure,
    roleId
  )
  const existingCodes = new Set(
    get(conferences).flatMap((item) => item.seatAccesses.map((access) => access.inviteCode))
  )
  const inviteCode = generateInviteCode(existingCodes)
  conference.setSeatAccesses([...conference.seatAccesses, { seatId: id, inviteCode }])
  syncCurrentCommittee()
  return id
}

export function rotateSeatInviteCode(seatId: string): string {
  const conference = get(currentConferenceRecord)
  if (!conference) return ''
  const existingCodes = new Set(
    get(conferences).flatMap((item) => item.seatAccesses.map((access) => access.inviteCode))
  )
  const inviteCode = generateInviteCode(existingCodes)
  const accesses = conference.seatAccesses.filter((access) => access.seatId !== seatId)
  conference.setSeatAccesses([...accesses, { seatId, inviteCode }])
  conferences.update((items) => [...items])
  return inviteCode
}

export function resetSeatUser(seatId: string): void {
  const engine = getEng()
  const conference = get(currentConferenceRecord)
  const seat = engine?.getSeat(seatId)
  if (!engine || !conference || !seat?.userId) return
  conference.setUsers(conference.users.filter((user) => user.id !== seat.userId))
  engine.updateSeat(seatId, { userId: undefined })
  syncCurrentCommittee()
}

export function updateSeat(id: string, updates: Partial<Seat>): void {
  const engine = getEng()
  if (!engine) return
  engine.updateSeat(id, updates)
  syncCurrentCommittee()
}

export function removeSeat(id: string): void {
  const engine = getEng()
  const conference = get(currentConferenceRecord)
  const seat = engine?.getSeat(id)
  if (!engine || !conference || !seat) return

  engine.removeSeat(id)
  conference.setSeatAccesses(conference.seatAccesses.filter((access) => access.seatId !== id))
  if (seat.userId) {
    conference.setUsers(conference.users.filter((user) => user.id !== seat.userId))
  }
  syncCurrentCommittee()
}

export function resolveCapabilities(seatId: string): Capability[] {
  const engine = getEng()
  const conference = get(currentConferenceRecord)
  if (!engine || !conference) return []
  const seat = engine.seats.find((item) => item.id === seatId)
  const group = conference.seatGroups.find((item) => item.id === seat?.seatGroupId)
  if (!seat || !group) return []
  return group.defaultCapabilities.filter((capability) => seat.capabilityOverrides[capability] !== false)
    .concat(Object.entries(seat.capabilityOverrides)
      .filter(([, enabled]) => enabled)
      .map(([capability]) => capability as Capability)
      .filter((capability) => !group.defaultCapabilities.includes(capability)))
}

// ---- 模式切换 -------------------------------------------------------------

export function setCabinetMode(seatGroupId: string, mode: CabinetMode): void {
  // Procedure is local to the Chair and is never routed through the Cloud Service.
  void seatGroupId
  void mode
}

// ---- 指令 -----------------------------------------------------------------

/** 当前会议的所有指令 */
export const directives = derived(currentCommittee, ($engine) => {
  void $engine
  return []
})

export function createDirective(data: {
  title: string
  targetCommitteeId: string
  content: string
}): string {
  void data
  return ''
}

// Content is Host-owned. UserClient commands in the delegate route are the
// only supported path for creating, reviewing, publishing, or withdrawing it.
