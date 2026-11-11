/**
 * data/timelines.ts — 时间线数据访问层
 *
 * 提供时间线的 CRUD 操作。`update()` 在落盘后自动 emit 对应事件。
 */

import { loadStore, saveStore } from './store'
import { eventBus } from '../event-bus'
import { createLogger } from '../logger'

const log = createLogger('Data:Timelines')

// ═══════════════════════════════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════════════════════════════

/** 时间线条目（完整数据） */
export interface TimelineEntry {
  id: string
  name: string
  createdAt: number
  state: TimelineState
}

/** 时间线运行状态 */
export interface TimelineState {
  paused: boolean
  ratio: number
  simulationAnchor: number
  realAnchor: number
}

/** 时间线摘要（列表视图） */
export interface TimelineSummary {
  id: string
  name: string
  createdAt: number
  paused: boolean
  ratio: number
  simTime: number
  realAnchor: number
}

// ═══════════════════════════════════════════════════════════════════
// 查询
// ═══════════════════════════════════════════════════════════════════

/** 获取所有时间线摘要列表 */
export function listTimelines(): TimelineSummary[] {
  const data = loadStore<TimelineEntry[]>('tools')
  if (!data || !Array.isArray(data)) return []

  return data.map((t) => {
    const state = t.state ?? {}
    return {
      id: t.id,
      name: t.name,
      createdAt: t.createdAt,
      paused: (state as TimelineState).paused ?? true,
      ratio: (state as TimelineState).ratio ?? 1,
      simTime: (state as TimelineState).simulationAnchor ?? 0,
      realAnchor: (state as TimelineState).realAnchor ?? 0
    }
  })
}

/** 获取单个时间线的完整数据 */
export function getTimeline(id: string): TimelineEntry | null {
  const data = loadStore<TimelineEntry[]>('tools')
  if (!data || !Array.isArray(data)) return null
  return data.find((t) => t.id === id) ?? null
}

// ═══════════════════════════════════════════════════════════════════
// 修改
// ═══════════════════════════════════════════════════════════════════

/**
 * 更新指定时间线的字段，自动落盘并 emit 对应事件。
 *
 * 事件推断规则：
 * - `state.paused` 变更 → `timeline:paused` 或 `timeline:resumed`
 * - `state.ratio` 变更 → `timeline:ratio_changed`
 *
 * @returns 更新后的时间线对象，找不到匹配 id 返回 null
 */
export function updateTimeline(id: string, patch: Partial<TimelineState>): TimelineEntry | null {
  const data = loadStore<TimelineEntry[]>('tools')
  if (!data || !Array.isArray(data)) return null

  const idx = data.findIndex((t) => t.id === id)
  if (idx === -1) {
    log.warn(`Timeline not found: ${id}`)
    return null
  }

  const prev = data[idx]
  const next: TimelineEntry = {
    ...prev,
    state: { ...prev.state, ...patch }
  }

  // 检测 paused 变更 → emit
  if (patch.paused !== undefined && patch.paused !== prev.state?.paused) {
    const eventType = patch.paused ? 'timeline:paused' : 'timeline:resumed'
    eventBus.emit(eventType, {
      timelineId: id,
      paused: patch.paused
    })
  }

  // 检测 ratio 变更 → emit
  if (patch.ratio !== undefined && patch.ratio !== prev.state?.ratio) {
    eventBus.emit('timeline:ratio_changed', {
      timelineId: id,
      prevRatio: prev.state?.ratio,
      ratio: patch.ratio
    })
  }

  data[idx] = next
  saveStore('tools', data)

  return next
}
