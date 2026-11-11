import type { Committee } from '$lib/classes/types/committee'
import type { ParticipantSeat } from '$lib/classes/types/delegate'
import { PHASE_LABELS } from './phase'
import { t } from '$lib/i18n'

type ChairCommitteeState = Pick<Committee, 'phase' | 'activeSpeaker' | 'activeCaucus'>

export type ChairScreen =
  | { kind: 'preamble' }
  | { kind: 'roll_call' }
  | { kind: 'pending_speakers_list' }
  | { kind: 'general_debate' }
  | { kind: 'caucus_setup' }
  | { kind: 'moderated_caucus' }
  | {
      kind: 'caucus_countdown'
      mode: 'unmoderated' | 'moderated_debate' | 'unmoderated_debate' | 'individual'
    }
  | { kind: 'voting' }
  | { kind: 'suspended' }
  | { kind: 'closed' }
  | { kind: 'invalid'; message: string }

export interface ChairPresentation {
  title: string
  screen: ChairScreen
  hasPrimaryAction: boolean
  canProposeMotion: boolean
  canProposePoint: boolean
  motionDisabledReason: string
  canResumeMeeting: boolean
}

export interface ChairRosterEntry {
  id: string
  name: string
  isPresent: boolean
  isVoter: boolean
  isObserver: boolean
}

/** Build the sidebar roster from Chair-owned procedure state, never claim state. */
export function getChairRosterEntries(
  seats: ParticipantSeat[],
  chairSeatId?: string
): ChairRosterEntry[] {
  return seats
    .filter((seat) => seat.id !== chairSeatId)
    .map((seat) => {
      const isPresent = seat.procedure.attendance === 'present'
      return {
        id: seat.id,
        name: seat.shortName || seat.name,
        isPresent,
        isVoter: isPresent && seat.procedure.hasVotingRights,
        isObserver: isPresent && !seat.procedure.hasVotingRights
      }
    })
}

const MOTION_PHASES = new Set<Committee['phase']>([
  'pending_speakers_list',
  'general_debate',
  'caucus_setup',
  'caucus',
  'voting'
])

function getChairScreen(committee: ChairCommitteeState): ChairScreen {
  switch (committee.phase) {
    case 'preamble':
      return { kind: 'preamble' }
    case 'roll_call':
      return { kind: 'roll_call' }
    case 'pending_speakers_list':
      return { kind: 'pending_speakers_list' }
    case 'general_debate':
      return { kind: 'general_debate' }
    case 'caucus_setup':
      return { kind: 'caucus_setup' }
    case 'caucus':
      if (!committee.activeCaucus) {
        return { kind: 'invalid', message: t('domain_missing_caucus') }
      }
      switch (committee.activeCaucus.type) {
        case 'moderated':
          return { kind: 'moderated_caucus' }
        case 'unmoderated':
        case 'moderated_debate':
        case 'unmoderated_debate':
        case 'individual':
          return { kind: 'caucus_countdown', mode: committee.activeCaucus.type }
      }
    case 'voting':
      return { kind: 'voting' }
    case 'suspended':
      return { kind: 'suspended' }
    case 'closed':
      return { kind: 'closed' }
  }
}

export function getChairPresentation(committee: ChairCommitteeState): ChairPresentation {
  const hasPrimaryAction = MOTION_PHASES.has(committee.phase)
  const isMotionInProgress = committee.phase === 'caucus' || committee.phase === 'caucus_setup'
  const isTimerActive = committee.activeSpeaker != null

  return {
    title: PHASE_LABELS[committee.phase],
    screen: getChairScreen(committee),
    hasPrimaryAction,
    canProposeMotion: hasPrimaryAction && !isTimerActive && !isMotionInProgress,
    canProposePoint: committee.phase !== 'closed',
    motionDisabledReason: isTimerActive
      ? t('domain_motion_disabled_speaker')
      : isMotionInProgress
        ? t('domain_motion_disabled_caucus')
        : '',
    canResumeMeeting: committee.phase === 'suspended' || committee.phase === 'closed'
  }
}
