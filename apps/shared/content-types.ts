/**
 * Shared Cloud Service domain contracts.
 *
 * These types are deliberately transport friendly: they contain no Svelte,
 * Electron, or persistence implementation details and can be used by both the
 * Cloud Service and a UserClient renderer.
 */

import { translate, type Locale, type MessageKey } from '../../packages/i18n/src/index.js'
import { getLocalizedLabels } from './action-types'

// ---------------------------------------------------------------------------
// Authorization and identities
// ---------------------------------------------------------------------------

/** Capabilities understood by the first Cloud Service release. */
export type Capability =
  | 'view_conference'
  | 'view_news'
  | 'view_situation'
  | 'view_files'
  | 'review_files'
  | 'draft_news'
  | 'review_news'
  | 'submit_directive'
  | 'process_directive'
  | 'send_files'
  | 'publish_situation'
  | 'withdraw_news'
  | 'withdraw_situation'
  | 'withdraw_files'
  | 'control_conference'
  | 'control_timeline'
  | 'draft_resolution'

export const CAPABILITIES: readonly Capability[] = [
  'view_conference',
  'view_news',
  'view_situation',
  'view_files',
  'review_files',
  'draft_news',
  'review_news',
  'submit_directive',
  'process_directive',
  'send_files',
  'publish_situation',
  'withdraw_news',
  'withdraw_situation',
  'withdraw_files',
  'control_conference',
  'control_timeline',
  'draft_resolution'
] as const

export const CAPABILITY_MESSAGE_KEYS: Record<Capability, MessageKey> = {
  view_conference: 'domain_capability_view_conference',
  view_news: 'domain_capability_view_news',
  view_situation: 'domain_capability_view_situation',
  view_files: 'domain_capability_view_files',
  review_files: 'domain_capability_review_files',
  draft_news: 'domain_capability_draft_news',
  review_news: 'domain_capability_review_news',
  submit_directive: 'domain_capability_submit_directive',
  process_directive: 'domain_capability_process_directive',
  send_files: 'domain_capability_send_files',
  publish_situation: 'domain_capability_publish_situation',
  withdraw_news: 'domain_capability_withdraw_news',
  withdraw_situation: 'domain_capability_withdraw_situation',
  withdraw_files: 'domain_capability_withdraw_files',
  control_conference: 'domain_capability_control_conference',
  control_timeline: 'domain_capability_control_timeline',
  draft_resolution: 'domain_capability_draft_resolution'
}

export const CAPABILITY_LABELS = getLocalizedLabels(CAPABILITY_MESSAGE_KEYS)

export function getCapabilityLabels(locale: Locale): Record<Capability, string> {
  return getLocalizedLabels(CAPABILITY_MESSAGE_KEYS, (key) => translate(key, {}, locale))
}

export type CommitteeType = 'cabinet' | 'mpc' | 'ipc'
/** Backwards-compatible spelling used by the existing conference editor. */
export type SeatGroupType = CommitteeType
export type CabinetMode = 'standing' | 'crisis'

/** The Host-owned committee metadata needed for routing and labels. */
export interface CommitteeRecord {
  id: string
  conferenceId: string
  name: string
  type: CommitteeType
  mode?: CabinetMode
  defaultCapabilities?: Capability[]
  sortOrder?: number
}

/** A safe Seat projection. It never contains a User's real name. */
export interface SeatRecord {
  id: string
  committeeId: string
  name: string
  role?: string
  roleId?: string
  capabilityOverrides?: Partial<Record<Capability, boolean>>
  proceduralProfile?: ProceduralSeatProfile
}

/** Static procedure configuration available only in a Chair projection. */
export interface ProceduralSeatProfile {
  shortName?: string
  flagUrl?: string
  hasVotingRights: boolean
  sortOrder: number
}

/** Identity returned to a normal UserClient after authentication. */
export interface UserClientIdentity {
  seatId: string
  seatName: string
  role?: string
  committeeId: string
  committeeName: string
  capabilities: Capability[]
}

// ---------------------------------------------------------------------------
// Shared content
// ---------------------------------------------------------------------------

export interface ContentOrigin {
  conferenceId: string
  sourceCommitteeId: string
  sourceSeatId: string
}

export interface ContentAuthorView {
  committeeName: string
  seatName: string
  role?: string
}

export interface ContentRecord extends ContentOrigin {
  id: string
  title: string
  content: string
  createdAt: number
  updatedAt: number
  /** The safe display-only author projection, never a User record. */
  author?: ContentAuthorView
}

export type DirectiveStatus = 'submitted' | 'processing' | 'approved' | 'rejected' | 'cancelled'

/** The sole recipient of a Directive. Seat and free-form targets are invalid. */
export interface DirectiveTarget {
  committeeId: string
}

export interface Directive extends ContentRecord {
  targetCommitteeId: string
  status: DirectiveStatus
  claimedBySeatId?: string
  claimedAt?: number
  processingNote?: string
  rejectedAt?: number
  approvedAt?: number
  cancelledAt?: number
  cancellationReason?: string
  /** Durable key supplied by a client to make submission idempotent. */
  idempotencyKey?: string
}

export type NewsStatus = 'submitted' | 'published' | 'rejected' | 'withdrawn'

export interface News extends Omit<ContentRecord, 'createdAt' | 'updatedAt'> {
  /** News source label, e.g. a wire-service name. */
  source: string
  contentTime: number
  status: NewsStatus
  revision: number
  createdAt: string
  updatedAt: string
  reviewedBySeatId?: string
  reviewedAt?: string
  reviewNote?: string
  publishedAt?: string
  withdrawnAt?: string
  withdrawalReason?: string
  /** Durable key supplied by a client to make submission idempotent. */
  idempotencyKey?: string
}

export type SituationStatus = 'published' | 'withdrawn'

export interface TimelineProjection {
  id: string
  name: string
  currentTime: number
  ratio: number
  paused: boolean
  version: number
}

export interface SituationUpdate extends Omit<ContentRecord, 'title' | 'content' | 'createdAt' | 'updatedAt'> {
  content: string
  contentTime: number
  status: SituationStatus
  publishedAt: string
  /** The IPC publish form receives this minimum projection only. */
  timeline?: TimelineProjection
  relatedBattleId?: string
  relatedLocation?: {
    lat: number
    lng: number
    label?: string
  }
  withdrawnAt?: string
  withdrawalReason?: string
}

export interface FileContent extends ContentOrigin {
  id: string
  title: string
  status: 'submitted' | 'published' | 'rejected' | 'cancelled' | 'withdrawn'
  fileType: string
  requestedVisibility: 'committee' | 'conference'
  visibility: 'committee' | 'conference'
  replacesFileId?: string
  reviewedAt?: string
  reviewNote?: string
  publishedAt?: string
  cancelledAt?: string
  agendaItem?: string
  fileName: string
  mimeType: string
  size: number
  createdAt: string
  author: ContentAuthorView
  withdrawnAt?: string
  withdrawalReason?: string
}

export type SharedContent = Directive | News | SituationUpdate | FileContent

// ---------------------------------------------------------------------------
// Projections
// ---------------------------------------------------------------------------

export interface UserClientSessionProjection {
  conferenceId: string
  conferenceName: string
  identity: UserClientIdentity
  /** Authorized normal content only; workflow queues are separate. */
  directives: Directive[]
  news: News[]
  situations: SituationUpdate[]
  /** Routing labels only, never Committee membership or procedure state. */
  directiveTargets: Array<{ id: string; name: string }>
  /** Available only to a Seat that may publish situations. */
  timelines: TimelineProjection[]
  /** File access is resolved through the Committee-scoped file route. */
  filesAvailable: boolean
}

export interface WorkflowAudienceProjection {
  directives: Directive[]
  news: News[]
}

/** A Seat with control_conference gets only its own Committee and static Seat information. */
export interface ChairCommitteeProjection {
  conferenceId: string
  conferenceName: string
  committee: CommitteeRecord
  seats: ChairSeatProjection[]
}

/**
 * Static seat data that a Chair needs to run its local procedure. Capability
 * configuration remains an Organizer Platform concern and is not part of this view.
 */
export interface ChairSeatProjection {
  id: string
  name: string
  role?: string
  proceduralProfile?: ProceduralSeatProfile
  /** The only allowed cross-user identity disclosure. */
  assignedUserName?: string
}

export interface AuthenticatedSeatSession {
  sessionId: string
  conferenceId: string
  seatId: string
  identity: UserClientIdentity
  projection: UserClientSessionProjection
  chairProjection?: ChairCommitteeProjection
  connectedAt: number
}

export interface LocalDraft<T extends object = Record<string, unknown>> {
  id: string
  kind: 'directive' | 'news' | 'situation'
  hostId: string
  conferenceId: string
  seatId: string
  updatedAt: number
  payload: T
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export type AuditActorKind = 'host_console' | 'user_client'

export interface AuditActor {
  kind: AuditActorKind
  sessionId?: string
  seatId?: string
}

export interface AuditLogEntry {
  id: string
  conferenceId?: string
  timestamp: number
  actor: AuditActor
  action: string
  entityType?:
    'conference' | 'committee' | 'seat' | 'directive' | 'news' | 'situation' | 'file' | 'session'
  entityId?: string
  reason?: string
  metadata?: Record<string, string | number | boolean | null>
}
