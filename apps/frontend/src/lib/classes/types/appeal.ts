export const APPEAL_READING_DURATION_SEC = 10 * 60
export const CONSENSUS_MEETING_DURATION_SEC = 25 * 60
export const CONSENSUS_SPEECH_DURATION_SEC = 3 * 60
export const MAX_CONSENSUS_MEETINGS = 3

export type AppealMeetingStatus = 'provisional' | 'formal' | 'informal'

export type AppealWorkflowStage =
  | 'roll_call'
  | 'agenda'
  | 'evaluation_debate'
  | 'document_reading'
  | 'negotiation_decision'
  | 'consensus_meeting'
  | 'pcn_finalization'
  | 'item_complete'
  | 'postponed'

export type AppealPcnStatus = 'draft' | 'reading' | 'negotiation' | 'ready' | 'finalized'

export interface AppealPcnVersion {
  version: number
  note?: string
  createdAt: number
}

export interface AppealPcn {
  id: string
  agendaItemId: string
  fileName: string
  status: AppealPcnStatus
  versions: AppealPcnVersion[]
  createdAt: number
  updatedAt: number
  finalizedAt?: number
}

export interface AppealReadingSession {
  startedAt: number
  durationSec: number
  completedAt?: number
}

export type AppealConsensusSpeakerStatus = 'waiting' | 'speaking' | 'finished'

export interface AppealConsensusSpeaker {
  id: string
  seatId: string
  allocatedTimeSec: number
  elapsedSec: number
  status: AppealConsensusSpeakerStatus
}

export type AppealConsensusMeetingStatus =
  'active' | 'awaiting_revision' | 'completed' | 'postponed'

export interface AppealConsensusMeeting {
  id: string
  agendaItemId: string
  motionId: string
  issue: string
  startedAt: number
  totalSec: number
  elapsedSec: number
  paused: boolean
  speakerTimeSec: number
  speakers: AppealConsensusSpeaker[]
  currentSpeakerIndex: number | null
  status: AppealConsensusMeetingStatus
  endedAt?: number
  revisionSubmittedAt?: number
  /** Chair-driven clock cursor; display never owns a timer. */
  lastTickAt?: number
}

export interface AppealNegotiationRecord {
  needed: boolean
  notes: string
  decidedAt: number
  revisedAt?: number
  confirmedAt?: number
}

export type AppealWorkflowEventType =
  | 'roll_call_confirmed'
  | 'agenda_accepted'
  | 'evaluation_started'
  | 'evaluation_ended'
  | 'pcn_saved'
  | 'reading_started'
  | 'reading_completed'
  | 'negotiation_requested'
  | 'negotiation_skipped'
  | 'revision_saved'
  | 'consensus_reading_started'
  | 'consensus_reading_completed'
  | 'consensus_confirmed'
  | 'pcn_finalized'
  | 'next_item_started'
  | 'agenda_objection_raised'
  | 'agenda_confirmed_formally'
  | 'agenda_rejected_informally'
  | 'consensus_meeting_started'
  | 'consensus_meeting_speaker_started'
  | 'consensus_meeting_speaker_finished'
  | 'consensus_meeting_ended'
  | 'consensus_revision_required'
  | 'consensus_revision_submitted'
  | 'consensus_meeting_postponed'
  | 'session_resumed'

export interface AppealWorkflowEvent {
  id: string
  type: AppealWorkflowEventType
  at: number
  detail?: string
}

export interface AppealWorkflowState {
  stage: AppealWorkflowStage
  meetingStatus: AppealMeetingStatus
  agendaRevisionRequired: boolean
  chairOverrideEnabled: boolean
  currentAgendaItemId: string | null
  agendaAcceptedAt?: number
  postponedAt?: number
  postponedAgendaItemId?: string
  completedAgendaItemIds: string[]
  pcnByAgendaItemId: Record<string, AppealPcn>
  reading: AppealReadingSession | null
  consensusReading: AppealReadingSession | null
  negotiation: AppealNegotiationRecord | null
  consensusMeetingsByAgendaItemId: Record<string, AppealConsensusMeeting[]>
  activeConsensusMeeting: AppealConsensusMeeting | null
  events: AppealWorkflowEvent[]
}
