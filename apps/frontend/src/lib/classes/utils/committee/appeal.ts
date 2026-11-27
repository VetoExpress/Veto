import {
  APPEAL_READING_DURATION_SEC,
  CONSENSUS_SPEECH_DURATION_SEC,
  MAX_CONSENSUS_MEETINGS,
  type AppealConsensusMeeting,
  type AppealConsensusSpeaker,
  type AppealPcn,
  type AppealPcnVersion,
  type AppealWorkflowEventType,
  type AppealWorkflowState
} from '$lib/classes/types/appeal'

export function isAppealCommitteeName(name: string | null | undefined): boolean {
  const normalized = name?.trim().toLowerCase() ?? ''
  return normalized.includes('appeal') || normalized.includes('unesco')
}

export function createAppealWorkflow(): AppealWorkflowState {
  return {
    stage: 'roll_call',
    meetingStatus: 'provisional',
    agendaRevisionRequired: false,
    chairOverrideEnabled: false,
    currentAgendaItemId: null,
    completedAgendaItemIds: [],
    pcnByAgendaItemId: {},
    reading: null,
    consensusReading: null,
    negotiation: null,
    consensusMeetingsByAgendaItemId: {},
    activeConsensusMeeting: null,
    events: []
  }
}

function clonePcnVersion(version: AppealPcnVersion): AppealPcnVersion {
  return {
    version: version.version,
    ...(version.note ? { note: version.note } : {}),
    createdAt: version.createdAt
  }
}

function clonePcn(pcn: AppealPcn): AppealPcn {
  return {
    ...pcn,
    fileName: pcn.fileName?.trim() || '',
    versions: pcn.versions.map(clonePcnVersion)
  }
}

function cloneConsensusSpeaker(speaker: AppealConsensusSpeaker): AppealConsensusSpeaker {
  return { ...speaker }
}

function cloneConsensusMeeting(meeting: AppealConsensusMeeting): AppealConsensusMeeting {
  return {
    ...meeting,
    speakers: meeting.speakers.map(cloneConsensusSpeaker)
  }
}

export function cloneAppealWorkflow(state: AppealWorkflowState): AppealWorkflowState {
  return {
    ...state,
    completedAgendaItemIds: [...state.completedAgendaItemIds],
    pcnByAgendaItemId: Object.fromEntries(
      Object.entries(state.pcnByAgendaItemId).map(([id, pcn]) => [id, clonePcn(pcn)])
    ),
    reading: state.reading ? { ...state.reading } : null,
    consensusReading: state.consensusReading ? { ...state.consensusReading } : null,
    negotiation: state.negotiation ? { ...state.negotiation } : null,
    consensusMeetingsByAgendaItemId: Object.fromEntries(
      Object.entries(state.consensusMeetingsByAgendaItemId ?? {}).map(([id, meetings]) => [
        id,
        meetings.map(cloneConsensusMeeting)
      ])
    ),
    activeConsensusMeeting: state.activeConsensusMeeting
      ? cloneConsensusMeeting(state.activeConsensusMeeting)
      : null,
    events: state.events.map((event) => ({ ...event }))
  }
}

export function normalizeAppealWorkflow(state: AppealWorkflowState): AppealWorkflowState {
  const meetingStatus = state.meetingStatus ?? (state.stage === 'agenda' ? 'provisional' : 'formal')
  const next = cloneAppealWorkflow({
    ...createAppealWorkflow(),
    ...state,
    meetingStatus,
    agendaRevisionRequired:
      state.agendaRevisionRequired ?? (state.stage === 'agenda' && meetingStatus === 'informal'),
    consensusMeetingsByAgendaItemId: state.consensusMeetingsByAgendaItemId ?? {},
    activeConsensusMeeting: state.activeConsensusMeeting ?? null,
    postponedAt: state.postponedAt,
    postponedAgendaItemId: state.postponedAgendaItemId
  })
  for (const [id, pcn] of Object.entries(next.pcnByAgendaItemId)) {
    next.pcnByAgendaItemId[id] = {
      ...pcn,
      fileName: pcn.fileName?.trim() || ''
    }
  }
  next.consensusMeetingsByAgendaItemId = Object.fromEntries(
    Object.entries(next.consensusMeetingsByAgendaItemId).map(([id, meetings]) => [
      id,
      meetings.map((meeting) => ({
        ...meeting,
        totalSec: meeting.totalSec || 25 * 60,
        speakerTimeSec: Math.min(
          meeting.speakerTimeSec || CONSENSUS_SPEECH_DURATION_SEC,
          CONSENSUS_SPEECH_DURATION_SEC
        ),
        speakers: meeting.speakers.map((speaker) => ({
          ...speaker,
          allocatedTimeSec: Math.min(
            speaker.allocatedTimeSec || CONSENSUS_SPEECH_DURATION_SEC,
            CONSENSUS_SPEECH_DURATION_SEC
          )
        }))
      }))
    ])
  )
  if (next.activeConsensusMeeting) {
    const meeting = next.activeConsensusMeeting
    const normalizedMeeting = {
      ...meeting,
      totalSec: meeting.totalSec || 25 * 60,
      speakerTimeSec: Math.min(
        meeting.speakerTimeSec || CONSENSUS_SPEECH_DURATION_SEC,
        CONSENSUS_SPEECH_DURATION_SEC
      ),
      speakers: meeting.speakers.map((speaker) => ({
        ...speaker,
        allocatedTimeSec: Math.min(
          speaker.allocatedTimeSec || CONSENSUS_SPEECH_DURATION_SEC,
          CONSENSUS_SPEECH_DURATION_SEC
        )
      }))
    }
    next.activeConsensusMeeting = normalizedMeeting
    const meetings = next.consensusMeetingsByAgendaItemId[normalizedMeeting.agendaItemId] ?? []
    next.consensusMeetingsByAgendaItemId[normalizedMeeting.agendaItemId] = meetings.some(
      (meeting) => meeting.id === normalizedMeeting.id
    )
      ? meetings.map((meeting) =>
          meeting.id === normalizedMeeting.id ? normalizedMeeting : meeting
        )
      : [...meetings, normalizedMeeting]
  }
  if (next.stage === 'consensus_meeting' && !next.activeConsensusMeeting) {
    next.stage = 'document_reading'
    next.reading = null
  }
  if (next.activeConsensusMeeting?.status === 'active' && next.stage !== 'consensus_meeting') {
    next.activeConsensusMeeting = null
  }
  if (next.stage === 'postponed') {
    next.activeConsensusMeeting = null
  }
  const agendaItemId = next.currentAgendaItemId
  const pcn = agendaItemId ? next.pcnByAgendaItemId[agendaItemId] : null
  if (!agendaItemId || !pcn || pcn.status === 'finalized') return next
  if (next.stage === 'consensus_meeting' && pcn.status !== 'negotiation') {
    next.pcnByAgendaItemId[agendaItemId] = { ...pcn, status: 'negotiation' }
  } else if (next.stage === 'pcn_finalization' && pcn.status !== 'ready') {
    next.pcnByAgendaItemId[agendaItemId] = { ...pcn, status: 'ready' }
  }
  return next
}

export interface AppealConsensusProgress {
  started: number
  completed: number
  limit: number
  active: boolean
  readingCompleted: boolean
  canStart: boolean
  canPostpone: boolean
}

export function isAppealReadingCompleted(state: AppealWorkflowState): boolean {
  return state.reading?.completedAt != null
}

export function getAppealConsensusProgress(
  state: AppealWorkflowState,
  agendaItemId: string | null = state.currentAgendaItemId
): AppealConsensusProgress {
  const meetings = agendaItemId ? (state.consensusMeetingsByAgendaItemId[agendaItemId] ?? []) : []
  const started = meetings.length
  const completed = meetings.filter((meeting) => meeting.status === 'completed').length
  const active = state.activeConsensusMeeting?.status === 'active'
  const hasActiveMeeting = state.activeConsensusMeeting != null
  const readingCompleted = isAppealReadingCompleted(state)
  const readingStage = state.stage === 'document_reading' || state.stage === 'negotiation_decision'
  return {
    started,
    completed,
    limit: MAX_CONSENSUS_MEETINGS,
    active,
    readingCompleted,
    canStart:
      readingStage && readingCompleted && started < MAX_CONSENSUS_MEETINGS && !hasActiveMeeting,
    canPostpone: started < MAX_CONSENSUS_MEETINGS && completed >= 2 && !hasActiveMeeting
  }
}

export function latestAppealPcnVersion(pcn: AppealPcn | null | undefined): AppealPcnVersion | null {
  if (!pcn || pcn.versions.length === 0) return null
  return pcn.versions[pcn.versions.length - 1] ?? null
}

export function appendAppealEvent(
  state: AppealWorkflowState,
  type: AppealWorkflowEventType,
  detail?: string
): AppealWorkflowState {
  const event = {
    id: crypto.randomUUID(),
    type,
    at: Date.now(),
    ...(detail ? { detail } : {})
  }
  return {
    ...state,
    events: [...state.events.slice(-49), event]
  }
}

export function ensureAppealPcn(
  state: AppealWorkflowState,
  agendaItemId: string
): AppealWorkflowState {
  if (state.pcnByAgendaItemId[agendaItemId]) return state
  const now = Date.now()
  const pcn: AppealPcn = {
    id: crypto.randomUUID(),
    agendaItemId,
    fileName: '',
    status: 'draft',
    versions: [{ version: 1, createdAt: now }],
    createdAt: now,
    updatedAt: now
  }
  return {
    ...state,
    pcnByAgendaItemId: {
      ...state.pcnByAgendaItemId,
      [agendaItemId]: pcn
    }
  }
}

export function nextAppealAgendaItemId(
  state: AppealWorkflowState,
  agendaItemIds: string[]
): string | null {
  const completed = new Set(state.completedAgendaItemIds)
  const currentIndex = state.currentAgendaItemId
    ? agendaItemIds.indexOf(state.currentAgendaItemId)
    : -1
  const ordered =
    currentIndex >= 0
      ? [...agendaItemIds.slice(currentIndex + 1), ...agendaItemIds.slice(0, currentIndex)]
      : agendaItemIds
  return ordered.find((id) => !completed.has(id)) ?? null
}

export function newAppealReadingSession(): AppealWorkflowState['reading'] {
  return {
    startedAt: Date.now(),
    durationSec: APPEAL_READING_DURATION_SEC
  }
}
