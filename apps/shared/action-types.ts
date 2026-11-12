/**
 * action-types.ts — 统一操作类型体系（main + renderer 进程共用）
 *
 * ConferenceActionType 是会议操作的权威定义，Service 插件事件类型由此派生。
 * TimelineActionType 是时间线操作的权威定义。
 * ActionType 统合两者，供插件事件系统等泛化场景使用。
 * 新增操作只需在此处添加，对应 EventType 会自动包含。
 */

export type MessageKey = string

export function getLocalizedLabels<Key extends string>(
  keys: Record<Key, MessageKey>,
  render: (key: MessageKey) => string = (key) => key
): Record<Key, string> {
  return Object.defineProperties({}, Object.fromEntries(
    Object.entries(keys).map(([value, key]) => [value, {
      enumerable: true,
      get: () => render(key as MessageKey)
    }])
  )) as Record<Key, string>
}

// ── 会议操作类型 ──────────────────────────────────────────────────────────

/** 会议操作类型（权威定义，共 27 种） */
export type ConferenceActionType =
  | 'roll_call_completed'
  | 'roll_call_reset'
  | 'speaker_ready'
  | 'speaker_cancelled'
  | 'speaker_started'
  | 'speaker_finished'
  | 'yield'
  | 'motion_proposed'
  | 'motion_voted'
  | 'motion_approved'
  | 'motion_rejected'
  | 'voting_started'
  | 'voting_ended'
  | 'caucus_started'
  | 'caucus_paused'
  | 'caucus_ended'
  | 'individual_speech_started'
  | 'individual_speech_ended'
  | 'meeting_suspended'
  | 'meeting_resumed'
  | 'meeting_closed'
  | 'resolution_introduced'
  | 'resolution_passed'
  | 'resolution_failed'
  | 'phase_changed'
  | 'attendance_changed'
  | 'point_proposed'
  | 'conference_created'

// ── 时间线操作类型 ────────────────────────────────────────────────────────

/** 时间线操作类型（共 6 种） */
export type TimelineActionType =
  | 'paused'
  | 'resumed'
  | 'ratio_changed'
  | 'time_milestone'
  | 'created'
  | 'deleted'

// ── 统一操作类型 ──────────────────────────────────────────────────────────

/** 所有操作类型的联合（用于插件事件系统等泛化场景） */
export type ActionType = ConferenceActionType | TimelineActionType

// ── 操作类型标签 ──────────────────────────────────────────────────────────

export const ACTION_MESSAGE_KEYS: Record<ActionType, MessageKey> = {
  // 会议操作
  roll_call_completed: 'domain_action_roll_call_completed',
  roll_call_reset: 'domain_action_roll_call_reset',
  speaker_ready: 'domain_action_speaker_ready',
  speaker_cancelled: 'domain_action_speaker_cancelled',
  speaker_started: 'domain_action_speaker_started',
  speaker_finished: 'domain_action_speaker_finished',
  yield: 'domain_action_yield',
  motion_proposed: 'domain_action_motion_proposed',
  motion_voted: 'domain_action_motion_voted',
  motion_approved: 'domain_action_motion_approved',
  motion_rejected: 'domain_action_motion_rejected',
  voting_started: 'domain_action_voting_started',
  voting_ended: 'domain_action_voting_ended',
  caucus_started: 'domain_action_caucus_started',
  caucus_paused: 'domain_action_caucus_paused',
  caucus_ended: 'domain_action_caucus_ended',
  individual_speech_started: 'domain_action_individual_speech_started',
  individual_speech_ended: 'domain_action_individual_speech_ended',
  meeting_suspended: 'domain_action_meeting_suspended',
  meeting_resumed: 'domain_action_meeting_resumed',
  meeting_closed: 'domain_action_meeting_closed',
  resolution_introduced: 'domain_action_resolution_introduced',
  resolution_passed: 'domain_action_resolution_passed',
  resolution_failed: 'domain_action_resolution_failed',
  phase_changed: 'domain_action_phase_changed',
  attendance_changed: 'domain_action_attendance_changed',
  point_proposed: 'domain_action_point_proposed',
  conference_created: 'domain_action_conference_created',
  // 时间线操作
  paused: 'domain_action_paused',
  resumed: 'domain_action_resumed',
  ratio_changed: 'domain_action_ratio_changed',
  time_milestone: 'domain_action_time_milestone',
  created: 'domain_action_created',
  deleted: 'domain_action_deleted'
}

export type EntryMessageValues = Record<string, string | number>

// ── 操作日志条目 ──────────────────────────────────────────────────────────

/** 操作日志条目基类（泛化：不限定具体的 actionType 子类型） */
export interface Entry {
  /** 唯一标识 */
  id: string
  /** 现实时间戳（毫秒） */
  timestamp: number
  /** 操作类型 */
  actionType: ActionType
  /** 操作描述文本 */
  description: string
  messageKey?: MessageKey
  messageValues?: EntryMessageValues
}

/** 会议操作条目（actionType 收窄为会议操作，增加关联字段） */
export interface ConferenceEntry extends Entry {
  actionType: ConferenceActionType
  /** 关联代表团 ID（可选） */
  relatedDelegationId?: string
  /** 关联动议 ID（可选） */
  relatedMotionId?: string
  /** 关联决议 ID（可选） */
  relatedResolutionId?: string
}
