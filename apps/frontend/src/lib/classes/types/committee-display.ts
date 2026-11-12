// ============================================================
// committee-display.ts - Chair-to-Display projection contracts
// ============================================================

import type { Attendance, SeatView } from './delegate'
import type {
  CaucusSpeakerStatus,
  CaucusType,
  ConferencePhase,
  ConferenceActionType,
  MotionType,
  PointType,
  ProposerPosition,
  YieldType
} from './committee'
import type { MajorityRule, VoteTargetType, ConferenceEntry } from './committee'
import type { TimerStatus } from './timer'
import type { Locale } from '$lib/i18n'

export type DisplayPhase = ConferencePhase | 'motion'

export interface MotionDraft {
  proposedBy?: SeatView
  type?: MotionType
  isRequestingVote?: boolean
  topic?: string
  totalTimeSec?: number
  speakingTimePerPersonSec?: number
  newTimeSec?: number
  documentName?: string
}

export interface PointDraft {
  proposedBy?: SeatView
  type?: PointType
}

export type SpeakerTransitionReason = 'timeout' | 'ended'

export interface ConferenceDisplaySpeaker {
  seat: SeatView
  remainingSec: number
  allocatedSec: number
  status: 'playing' | 'paused'
}

export interface ConferenceDisplayData {
  locale?: Locale
  conferenceId: string
  phase: DisplayPhase
  venue: string
  name: string
  presentCount: number
  votingCount: number
  motionDraft?: MotionDraft
  pointDraft?: PointDraft
  currentSpeaker?: ConferenceDisplaySpeaker
  readySpeaker?: {
    seat: SeatView
  }
  speakersList: Array<{
    seat: SeatView
    status: string
  }>
  votingSession?: {
    targetDescription: string
    targetType: VoteTargetType
    majorityRule: MajorityRule
    tally: { yes: number; no: number; abstain: number; present: number }
    result?: string
    round: number
    currentSeatId: string | null
    ballots: Array<{
      seatId: string
      seatName: string
      shortName?: string
      vote: string | null
    }>
  }
  activeMotion?: {
    type: MotionType
    topic?: string
    status: string
    proposedBy: SeatView
    motionId: string
    totalTimeSec?: number
    speakingTimePerPersonSec?: number
    newTimeSec?: number
    documentName?: string
  }
  activePoint?: {
    type: PointType
    proposedBy: SeatView
    pointId: string
  }
  caucusSetup?: {
    topic?: string
    proposerName?: string
    proposerPosition: ProposerPosition
    speakerSeatIds: string[]
    speakerNames: SeatView[]
  }
  caucusTimer?: {
    remainingSec: number
    totalSec: number
    type: CaucusType
    status: TimerStatus
    topic?: string
    caucusSpeakers?: Array<{
      seatName: string
      seat: SeatView
      status: CaucusSpeakerStatus
      allocatedTimeSec: number
    }>
    currentSpeakerIndex?: number
    speakerTransition?: SpeakerTransitionReason
  }
  recentMinutes: Array<{
    timestamp: number
    eventType: ConferenceActionType
    description: string
    messageKey?: ConferenceEntry['messageKey']
    messageValues?: ConferenceEntry['messageValues']
  }>
  yieldPending?: {
    yieldType: YieldType
    originalSeat: SeatView
    questionerSeat?: SeatView
    remainingSec: number
  }
  attendanceChange?: SeatView
  rollCall?: {
    currentIndex: number
    totalCount: number
    currentSeat?: SeatView
    presentCount: number
    simpleMajorityThreshold: number
    twoThirdsThreshold: number
    lastMarked?: {
      seat: SeatView
      status: Attendance
      index: number
    }
  }
}
