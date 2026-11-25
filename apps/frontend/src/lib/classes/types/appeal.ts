export const APPEAL_READING_DURATION_SEC = 10 * 60

export type AppealWorkflowStage =
  | 'roll_call'
  | 'agenda'
  | 'evaluation_debate'
  | 'document_reading'
  | 'negotiation_decision'
  | 'consensus_meeting'
  | 'pcn_finalization'
  | 'item_complete'

export type AppealPcnStatus = 'draft' | 'reading' | 'negotiation' | 'ready' | 'finalized'

export interface AppealPcnVersion {
  version: number
  title: string
  content: string
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

export interface AppealWorkflowEvent {
  id: string
  type: AppealWorkflowEventType
  at: number
  detail?: string
}

export interface AppealWorkflowState {
  stage: AppealWorkflowStage
  currentAgendaItemId: string | null
  agendaAcceptedAt?: number
  completedAgendaItemIds: string[]
  pcnByAgendaItemId: Record<string, AppealPcn>
  reading: AppealReadingSession | null
  consensusReading: AppealReadingSession | null
  negotiation: AppealNegotiationRecord | null
  events: AppealWorkflowEvent[]
}
