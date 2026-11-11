/**
 * data/conferences.ts — 会议数据访问层
 *
 * 提供会议的 CRUD 操作。`update()` 方法在落盘后自动 emit 对应事件，
 * 确保插件和 UI 能实时响应状态变更。
 */

import { loadStore, saveStore } from './store'
import { eventBus } from '../event-bus'
import { createLogger } from '../logger'

const log = createLogger('Data:Conferences')

// ═══════════════════════════════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════════════════════════════

/** 会议条目（完整数据） */
export interface ConferenceEntry {
  id: string
  name: string
  venue?: string
  phase: string
  presentCount: number
  votingCount: number
  currentSpeaker?: {
    seat: string
    remaining: number
  }
  timelineId?: string | null
  minutes?: MinutesEntry[]
  seatGroups?: unknown[]
  seats?: unknown[]
  news?: unknown[]
  situationUpdates?: unknown[]
}

/** 会议日志条目 */
export interface MinutesEntry {
  id: string
  timestamp: number
  type: string
  title: string
  detail?: string
}

/** 会议摘要（列表视图） */
export interface ConferenceSummary {
  id: string
  name: string
  venue?: string
  phase: string
  presentCount: number
  votingCount: number
  currentSpeaker?: { seat: string; remaining: number }
  timelineId?: string | null
}

// ═══════════════════════════════════════════════════════════════════
// 查询
// ═══════════════════════════════════════════════════════════════════

/** 获取所有会议摘要列表 */
export function listConferences(): ConferenceSummary[] {
  const data = loadStore<ConferenceEntry[]>('conferences')
  if (!data || !Array.isArray(data)) return []

  return data.map((c) => ({
    id: c.id,
    name: c.name,
    venue: c.venue,
    phase: c.phase ?? 'preamble',
    presentCount: c.presentCount ?? 0,
    votingCount: c.votingCount ?? 0,
    currentSpeaker: c.currentSpeaker,
    timelineId: c.timelineId
  }))
}

/** 获取单个会议的完整数据 */
export function getConference(id: string): ConferenceEntry | null {
  const data = loadStore<ConferenceEntry[]>('conferences')
  if (!data || !Array.isArray(data)) return null
  return data.find((c) => c.id === id) ?? null
}

/** 获取会议日志（最近 N 条） */
export function getMinutes(conferenceId: string, limit = 10): MinutesEntry[] {
  const conf = getConference(conferenceId)
  if (!conf?.minutes) return []

  return conf.minutes
    .slice(-limit)
    .map((m) => ({
      id: m.id,
      timestamp: m.timestamp,
      type: m.type ?? 'info',
      title: m.title?.slice(0, 30) ?? '',
      detail: m.detail
    }))
    .reverse()
}

// ═══════════════════════════════════════════════════════════════════
// 修改
// ═══════════════════════════════════════════════════════════════════

/**
 * 更新指定会议的字段，自动落盘并 emit 对应事件。
 *
 * 事件推断规则：
 * - `phase` 变更 → `conference:phase_changed`
 * - `currentSpeaker` 新增/变更 → `conference:speaker_started`
 * - `currentSpeaker` 移除 → `conference:speaker_finished`
 * - 其他字段变更 → 通用 `conference:updated`
 *
 * @returns 更新后的会议对象，找不到匹配 id 返回 null
 */
export function updateConference(
  id: string,
  patch: Partial<
    Pick<
      ConferenceEntry,
      'phase' | 'presentCount' | 'votingCount' | 'currentSpeaker' | 'timelineId'
    >
  >
): ConferenceEntry | null {
  const data = loadStore<ConferenceEntry[]>('conferences')
  if (!data || !Array.isArray(data)) return null

  const idx = data.findIndex((c) => c.id === id)
  if (idx === -1) {
    log.warn(`Conference not found: ${id}`)
    return null
  }

  const prev = data[idx]
  const next: ConferenceEntry = { ...prev, ...patch }

  // 检测 phase 变更 → emit
  if (patch.phase !== undefined && patch.phase !== prev.phase) {
    eventBus.emit('conference:phase_changed', {
      conferenceId: id,
      prevPhase: prev.phase,
      phase: patch.phase
    })
  }

  // 检测 speaker 变更 → emit
  if (patch.currentSpeaker !== undefined) {
    if (patch.currentSpeaker && !prev.currentSpeaker) {
      eventBus.emit('conference:speaker_started', {
        conferenceId: id,
        seat: patch.currentSpeaker.seat,
        remaining: patch.currentSpeaker.remaining
      })
    } else if (!patch.currentSpeaker && prev.currentSpeaker) {
      eventBus.emit('conference:speaker_finished', {
        conferenceId: id,
        seat: prev.currentSpeaker.seat
      })
    }
  }

  data[idx] = next
  saveStore('conferences', data)

  return next
}
