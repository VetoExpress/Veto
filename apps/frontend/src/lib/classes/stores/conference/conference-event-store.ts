/**
 * 大会创建适配层，持久化实体只有 Conference。
 */
import { get } from 'svelte/store'
import type { Committee, Conference } from '$lib/classes/types/conference'
import type { RoleTemplate } from '$lib/classes/types/event'
import type { ProcedureRulesConfig } from '$lib/classes/types/procedure-rules'
import type { Capability, Seat, SeatAccess, SeatGroup, SeatGroupType } from '$lib/classes/types/delegate'
import { conferences, createConference, saveConferencesNow, getConferenceById } from './conference-store'
import { generateInviteCode } from '$lib/classes/services/seat-access'

export interface CommitteeDraft {
  id: string
  name: string
  type: SeatGroupType
  seats: Array<{
    id: string
    name: string
    shortName?: string
    roleId?: string
    hasVotingRights?: boolean
    hasVetoPower?: boolean
  }>
  procedureRules: ProcedureRulesConfig
  agenda?: Array<{ title: string; description?: string }>
}

export interface CreateConferenceInput {
  mode?: 'conference' | 'singleton' | null
  name: string
  description?: string
  organizer?: string
  roleTemplates: RoleTemplate[]
  committees: CommitteeDraft[]
}

function createId(): string {
  return crypto.randomUUID()
}

function capabilityOverrides(capabilities: Capability[]): Seat['capabilityOverrides'] {
  return Object.fromEntries(capabilities.map((capability) => [capability, true]))
}

function mapProcedureRulesToCreatedSeats(
  rules: ProcedureRulesConfig,
  draftSeats: CommitteeDraft['seats'],
  seats: Seat[]
): ProcedureRulesConfig {
  const vetoSeatIds = seats.flatMap((seat, index) => {
    const draftSeat = draftSeats[index]
    return draftSeat?.hasVetoPower || rules.veto.seatIds.includes(draftSeat?.id ?? '')
      ? [seat.id]
      : []
  })
  return {
    ...rules,
    veto: { enabled: vetoSeatIds.length > 0, seatIds: vetoSeatIds }
  }
}

function createCommittee(
  id: string,
  name: string,
  seats: Seat[],
  agenda: Array<{ title: string; description?: string }> = [],
  procedureRules?: ProcedureRulesConfig
): Committee {
  return {
    id,
    name,
    phase: 'preamble',
    agenda: agenda.map((item, index) => ({
      id: crypto.randomUUID(),
      title: item.title.trim(),
      description: item.description?.trim() || undefined,
      sortOrder: index
    })),
    seats,
    speakerLists: { id: 'main', name: '主发言名单', entries: [] },
    motions: [],
    dismissedResolvedMotionIds: [],
    points: [],
    dismissedPointIds: [],
    draftResolutions: [],
    documentNames: [],
    votingSessions: [],
    minutes: [],
    ...(procedureRules ? { procedureRules } : {}),
    defaultSpeakingTimeSec: 120,
    activeCaucus: null,
    activeSpeaker: null
  }
}

export function getCreatedConferenceById(id: string): Conference | null {
  return get(conferences).find((conference) => conference.id === id) ?? null
}

/** Creates one Conference with all of the requested Committee records. */
export async function createConferenceFromDraft(input: CreateConferenceInput): Promise<string | null> {
  const name = input.name.trim()
  if (!name || input.committees.length === 0) return null

  if (input.mode === 'singleton') {
    if (input.committees.length !== 1) return null
    const draft = input.committees[0]
    if (!draft || draft.type !== 'cabinet' || !draft.name.trim() || draft.seats.length === 0) return null
    if (draft.seats.some((seat) => !seat.name.trim())) return null

    const groupId = createId()
    const seatGroup: SeatGroup = {
      id: groupId,
      name: '参会席位',
      type: 'cabinet',
      defaultCapabilities: [],
      sortOrder: 0
    }
    const seats: Seat[] = draft.seats.map((draftSeat, sortOrder) => ({
      id: createId(),
      name: draftSeat.name.trim(),
      shortName: draftSeat.shortName?.trim() || undefined,
      seatGroupId: groupId,
      capabilityOverrides: {},
      procedure: {
        attendance: 'absent',
        hasVotingRights: draftSeat.hasVotingRights ?? true,
        hasVetoPower: draftSeat.hasVetoPower ?? false,
        sortOrder
      }
    }))
    const singletonCommittee = createCommittee(
      draft.id,
      draft.name.trim(),
      seats,
      draft.agenda ?? [],
      mapProcedureRulesToCreatedSeats(draft.procedureRules, draft.seats, seats)
    )

    const conferenceId = createConference(name, singletonCommittee.name, [], [], {
      id: createId(),
      seatGroups: [seatGroup],
      seatAccesses: [],
      committees: [singletonCommittee]
    })
    const conference = getConferenceById(conferenceId)
    if (!conference) return null
    conference.rename(name)
    conference.setMode('singleton')
    conference.description = input.description?.trim() || undefined
    conference.organizer = input.organizer?.trim() || undefined
    conference.setRoleTemplates([])
    conference.setSeatAccesses([])
    conferences.update((items) => [...items])
    await saveConferencesNow()
    return conferenceId
  }

  const roleTemplates = input.roleTemplates.map((role) => ({ ...role, name: role.name.trim() }))
  const roles = new Map(roleTemplates.map((role) => [role.id, role]))
  const mpcReporterRoleIds = new Set(
    roleTemplates.filter((role) => role.name.replace(/\s+/g, '') === 'MPC记者').map((role) => role.id)
  )
  const ipcRoleIds = new Set(
    roleTemplates.filter((role) => role.name.replace(/\s+/g, '') === 'IPC').map((role) => role.id)
  )
  const staffRoleIds = new Set(
    roleTemplates.filter((role) => role.name.trim() === 'Staff').map((role) => role.id)
  )
  if (
    input.committees.some(
      (draft) =>
        draft.seats.some((seat) => {
          const roleId = seat.roleId ?? ''
          if (staffRoleIds.has(roleId)) return false
          if (draft.type === 'mpc') {
            return !mpcReporterRoleIds.has(roleId) && !ipcRoleIds.has(roleId)
          }
          if (draft.type === 'ipc') return !ipcRoleIds.has(roleId)
          return mpcReporterRoleIds.has(roleId)
        })
    )
  ) {
    return null
  }
  const existingKeys = new Set(get(conferences).flatMap((conference) => conference.seatAccesses.map((access) => access.inviteCode)))
  const seatGroups: SeatGroup[] = []
  const seatAccesses: SeatAccess[] = []
  const committees: Committee[] = []

  for (const [index, draft] of input.committees.entries()) {
    const groupId = createId()
    seatGroups.push({
      id: groupId,
      name: draft.name.trim(),
      type: draft.type,
      defaultCapabilities: [],
      sortOrder: index
    })
    const seats = draft.seats.map((draftSeat, sortOrder) => {
      const roleId = draftSeat.roleId ?? ''
      const role = roles.get(roleId)
      const seat: Seat = {
        id: createId(),
        name: draftSeat.name.trim(),
        shortName: draftSeat.shortName?.trim() || undefined,
        seatGroupId: groupId,
        capabilityOverrides: capabilityOverrides(role?.capabilities ?? []),
        role: role?.name,
        roleId,
        procedure:
          draft.type === 'cabinet'
            ? {
                attendance: 'absent',
                hasVotingRights: draftSeat.hasVotingRights ?? true,
                hasVetoPower: draftSeat.hasVetoPower ?? false,
                sortOrder
              }
            : undefined
      }
      seatAccesses.push({ seatId: seat.id, inviteCode: generateInviteCode(existingKeys) })
      return seat
    })
    committees.push(
      createCommittee(
        draft.id,
        draft.name.trim(),
        seats,
        [],
        mapProcedureRulesToCreatedSeats(draft.procedureRules, draft.seats, seats)
      )
    )
  }

  const conferenceId = createConference(name, committees[0].name, [], [], {
    id: createId(),
    seatGroups,
    seatAccesses,
    committees
  })
  const conference = getConferenceById(conferenceId)
  if (!conference) return null
  conference.rename(name)
  conference.description = input.description?.trim() || undefined
  conference.organizer = input.organizer?.trim() || undefined
  conference.updateSeatGroups(() => seatGroups)
  conference.setRoleTemplates(roleTemplates)
  conferences.update((items) => [...items])
  await saveConferencesNow()
  return conferenceId
}
