import {
  APPEAL_READING_DURATION_SEC,
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
    currentAgendaItemId: null,
    completedAgendaItemIds: [],
    pcnByAgendaItemId: {},
    reading: null,
    consensusReading: null,
    negotiation: null,
    events: []
  }
}

function clonePcnVersion(version: AppealPcnVersion): AppealPcnVersion {
  return { ...version }
}

function clonePcn(pcn: AppealPcn): AppealPcn {
  return {
    ...pcn,
    fileName: pcn.fileName?.trim() || pcn.versions.at(-1)?.title || '',
    versions: pcn.versions.map(clonePcnVersion)
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
    events: state.events.map((event) => ({ ...event }))
  }
}

export function normalizeAppealWorkflow(state: AppealWorkflowState): AppealWorkflowState {
  const next = cloneAppealWorkflow(state)
  for (const [id, pcn] of Object.entries(next.pcnByAgendaItemId)) {
    next.pcnByAgendaItemId[id] = {
      ...pcn,
      fileName: pcn.fileName?.trim() || pcn.versions.at(-1)?.title || ''
    }
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
  agendaItemId: string,
  title: string
): AppealWorkflowState {
  if (state.pcnByAgendaItemId[agendaItemId]) return state
  const now = Date.now()
  const pcn: AppealPcn = {
    id: crypto.randomUUID(),
    agendaItemId,
    fileName: '',
    status: 'draft',
    versions: [{ version: 1, title, content: '', createdAt: now }],
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
