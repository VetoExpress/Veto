// ============================================================
// committee.ts - Committee procedure domain contracts
// ============================================================

import type { Attendance, Seat } from './delegate'
import type {
  ConferenceActionType,
  Entry,
  ConferenceEntry
} from '../../../../../shared/action-types'
import { ACTION_MESSAGE_KEYS, getLocalizedLabels } from '../../../../../shared/action-types'
import { t } from '$lib/i18n'
import type { MessageKey } from '@vetoexpress/i18n'

export type { Attendance, ParticipantSeat, Seat, SeatView } from './delegate'
export type { ConferenceActionType, Entry, ConferenceEntry }
export const ACTION_LABELS = getLocalizedLabels(ACTION_MESSAGE_KEYS, t)

export type ConferencePhase =
  | 'preamble'
  | 'roll_call'
  | 'pending_speakers_list'
  | 'general_debate'
  | 'caucus'
  | 'voting'
  | 'caucus_setup'
  | 'suspended'
  | 'closed'

export interface AgendaItem {
  id: string
  title: string
  description?: string
  sortOrder: number
}

export type YieldType = 'chair' | 'delegate' | 'question' | 'comment'

export type SpeakerEntryStatus = 'waiting' | 'ready' | 'speaking' | 'finished' | 'interrupted'

export type CaucusSpeakerStatus = 'waiting' | 'ready' | 'speaking'

export interface YieldChoice {
  type: YieldType
  seatId?: string
  fromSeatId?: string
}

export interface YieldPendingState {
  originalEntryId: string
  originalSeatId: string
  yieldType: YieldType
  remainingSec: number
  allocatedSec: number
  questionerSeatId?: string
}

export interface SpeakerEntry {
  id: string
  seatId: string
  allocatedTimeSec: number
  remainingTimeSec?: number
  status: SpeakerEntryStatus
  yield?: YieldChoice
  canYield?: boolean
}

export interface SpeakerDisplayEntry {
  id: string
  seatId: string
  seatName: string
  status: string
  allocatedTimeSec: number
}

export interface SpeakerListData {
  id: string
  name: string
  entries: SpeakerEntry[]
}

export type PointType = 'point_of_order' | 'point_of_inquiry' | 'point_of_personal_privilege'

export const POINT_MESSAGE_KEYS: Record<PointType, MessageKey> = {
  point_of_order: 'domain_point_point_of_order',
  point_of_inquiry: 'domain_point_point_of_inquiry',
  point_of_personal_privilege: 'domain_point_point_of_personal_privilege'
}
export const POINT_LABELS = getLocalizedLabels(POINT_MESSAGE_KEYS, t)

export type MotionType =
  | 'open_speakers_list'
  | 'moderated_caucus'
  | 'unmoderated_caucus'
  | 'moderated_debate'
  | 'unmoderated_debate'
  | 'modify_speaking_time'
  | 'postpone_resolution'
  | 'resume_resolution'
  | 'closure_debate'
  | 'suspend_meeting'
  | 'close_meeting'
  | 'reorder_resolution'
  | 'substantive_vote'
  | 'change_attendance'
  | 'individual_speech'

export type MotionStatus = 'pending' | 'approved' | 'rejected' | 'expired'

export interface AbstractMotion {
  id: string
  type: MotionType
  proposedBySeatId: string
  proposedAt: number
  status: MotionStatus
}

export interface OpenSpeakersListMotion extends AbstractMotion {
  type: 'open_speakers_list'
}

export interface ModeratedCaucusMotion extends AbstractMotion {
  type: 'moderated_caucus'
  topic: string
  totalTimeSec: number
  speakingTimePerPersonSec: number
  maxSpeakers: number
}

export interface UnmoderatedCaucusMotion extends AbstractMotion {
  type: 'unmoderated_caucus'
  durationSec: number
}

export interface ModeratedDebateMotion extends AbstractMotion {
  type: 'moderated_debate'
  topic: string
  durationSec: number
}

export interface UnmoderatedDebateMotion extends AbstractMotion {
  type: 'unmoderated_debate'
  durationSec: number
}

export interface ModifySpeakingTimeMotion extends AbstractMotion {
  type: 'modify_speaking_time'
  newTimeSec: number
}

export interface PostponeResolutionMotion extends AbstractMotion {
  type: 'postpone_resolution'
  agendaItemId: string
}

export interface ResumeResolutionMotion extends AbstractMotion {
  type: 'resume_resolution'
  agendaItemId: string
}

export interface ClosureDebateMotion extends AbstractMotion {
  type: 'closure_debate'
}

export interface SuspendMeetingMotion extends AbstractMotion {
  type: 'suspend_meeting'
}

export interface CloseMeetingMotion extends AbstractMotion {
  type: 'close_meeting'
}

export interface ReorderResolutionMotion extends AbstractMotion {
  type: 'reorder_resolution'
  newOrder: string[]
}

export interface SubstantiveVoteMotion extends AbstractMotion {
  type: 'substantive_vote'
  documentName: string
}

export interface ChangeAttendanceMotion extends AbstractMotion {
  type: 'change_attendance'
  newAttendance: Attendance
}

export interface IndividualSpeechMotion extends AbstractMotion {
  type: 'individual_speech'
  durationSec: number
}

export type Motion =
  | OpenSpeakersListMotion
  | ModeratedCaucusMotion
  | UnmoderatedCaucusMotion
  | ModeratedDebateMotion
  | UnmoderatedDebateMotion
  | ModifySpeakingTimeMotion
  | PostponeResolutionMotion
  | ResumeResolutionMotion
  | ClosureDebateMotion
  | SuspendMeetingMotion
  | CloseMeetingMotion
  | ReorderResolutionMotion
  | SubstantiveVoteMotion
  | ChangeAttendanceMotion
  | IndividualSpeechMotion

export type MotionProposal = Motion extends infer T
  ? T extends Motion
    ? Omit<T, 'id' | 'proposedAt' | 'status'>
    : never
  : never

export const MOTION_MESSAGE_KEYS: Record<MotionType, MessageKey> = {
  open_speakers_list: 'domain_motion_open_speakers_list',
  moderated_caucus: 'domain_motion_moderated_caucus',
  unmoderated_caucus: 'domain_motion_unmoderated_caucus',
  moderated_debate: 'domain_motion_moderated_debate',
  unmoderated_debate: 'domain_motion_unmoderated_debate',
  modify_speaking_time: 'domain_motion_modify_speaking_time',
  postpone_resolution: 'domain_motion_postpone_resolution',
  resume_resolution: 'domain_motion_resume_resolution',
  closure_debate: 'domain_motion_closure_debate',
  suspend_meeting: 'domain_motion_suspend_meeting',
  close_meeting: 'domain_motion_close_meeting',
  reorder_resolution: 'domain_motion_reorder_resolution',
  substantive_vote: 'domain_motion_substantive_vote',
  change_attendance: 'domain_motion_change_attendance',
  individual_speech: 'domain_motion_individual_speech'
}
export const MOTION_LABELS = getLocalizedLabels(MOTION_MESSAGE_KEYS, t)

export interface Point {
  id: string
  type: PointType
  proposedBySeatId: string
  proposedAt: number
}

export interface DraftResolution {
  id: string
  title: string
  sponsors: string[]
  signatories: string[]
  content: string
  agendaItemId?: string
  createdAt: number
}

export type VoteValue = 'yes' | 'no' | 'abstain' | 'skip'
export type MajorityRule = 'simple_majority' | 'two_thirds'
export type VoteTargetType = 'motion' | 'resolution'

export interface VoteBallot {
  seatId: string
  vote: VoteValue
}

export interface VotingSession {
  id: string
  targetType: VoteTargetType
  targetId: string
  majorityRule: MajorityRule
  ballots: VoteBallot[]
  startedAt: number
  endedAt?: number
  result?: 'passed' | 'failed'
  currentSeatId: string | null
  round: number
}

export interface MajorityThresholds {
  presentCount: number
  votingCount: number
  totalCount: number
  simpleMajorityThreshold: number
  twoThirdsThreshold: number
}

export type ProposerPosition = 'first' | 'last'
export type CaucusType =
  'moderated' | 'unmoderated' | 'moderated_debate' | 'unmoderated_debate' | 'individual'

export interface Committee {
  id: string
  name: string
  phase: ConferencePhase
  agenda: AgendaItem[]
  seats: Seat[]
  speakerLists?: SpeakerListData
  motions: Motion[]
  dismissedResolvedMotionIds: string[]
  points: Point[]
  dismissedPointIds: string[]
  draftResolutions: DraftResolution[]
  documentNames: string[]
  votingSessions: VotingSession[]
  minutes: ConferenceEntry[]
  defaultSpeakingTimeSec: number
  /** 实质性投票的通过门槛；旧会议默认使用 2/3 多数。 */
  substantiveVotingMajority?: MajorityRule
  caucusSetup?: {
    motionId: string
    proposerPosition: ProposerPosition
    speakerSeatIds: string[]
    remainingSec?: number
  } | null
  /** 点名完成后的目标阶段；辩论结束触发的投票前点名设为 voting。 */
  postRollCallPhase?: 'pending_speakers_list' | 'voting'
  activeCaucus?: {
    motionId: string
    type: CaucusType
    totalSec: number
    elapsedSec: number
    paused: boolean
    updatedAt?: number
    caucusSpeakers?: SpeakerEntry[]
    currentSpeakerIndex?: number
  } | null
  activeSpeaker?: {
    entryId: string
    totalSec: number
    elapsedSec: number
    paused: boolean
  } | null
  yieldPending?: YieldPendingState | null
}
