/**
 * data.test.ts — Data 层集成测试
 *
 * 缝合面：
 * - listConferences / listTimelines — 空 store → []
 * - getConference / getTimeline — 找不到 → null
 * - getMinutes — 截断 + 倒序
 * - updateConference → 落盘 + emit 事件
 * - updateTimeline → 落盘 + emit 事件
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock logger（避免 electron 依赖）
vi.mock('../logger')

// ── Mock store（内存替代文件系统）──────────────────────────

const { storeData } = vi.hoisted(() => {
  return { storeData: new Map<string, unknown>() }
})

vi.mock('../data/store', () => ({
  loadStore: vi.fn((domain: string) => storeData.get(domain) ?? null),
  saveStore: vi.fn((domain: string, data: unknown) => {
    storeData.set(domain, data)
  }),
  deleteStore: vi.fn((domain: string) => {
    storeData.delete(domain)
  }),
  migrateFromLocalStorage: vi.fn()
}))

import { eventBus } from '../event-bus'
import { listConferences, getConference, getMinutes, updateConference } from '../data/conferences'
import type { ConferenceEntry } from '../data/conferences'
import { listTimelines, getTimeline, updateTimeline } from '../data/timelines'
import type { TimelineEntry, TimelineState } from '../data/timelines'

// ── Helper ─────────────────────────────────────────────────

/** 创建一个测试会议 */
function makeConference(overrides: Partial<ConferenceEntry> = {}): ConferenceEntry {
  return {
    id: 'conf-1',
    name: 'Test Conference',
    venue: 'Security Council',
    phase: 'general_debate',
    presentCount: 15,
    votingCount: 12,
    minutes: [
      {
        id: 'min-1',
        timestamp: 1000,
        type: 'speaker_started',
        title: 'Speaker started',
        detail: 'Seat A begins'
      },
      {
        id: 'min-2',
        timestamp: 2000,
        type: 'speaker_finished',
        title: 'Speaker finished'
      },
      {
        id: 'min-3',
        timestamp: 3000,
        type: 'phase_changed',
        title: 'Phase changed to debate'
      }
    ],
    ...overrides
  }
}

/** 创建一个测试时间线 */
function makeTimeline(overrides: Partial<TimelineEntry> = {}): TimelineEntry {
  return {
    id: 'tl-1',
    name: 'Test Timeline',
    createdAt: Date.now(),
    state: {
      paused: false,
      ratio: 60,
      simulationAnchor: 0,
      realAnchor: Date.now()
    },
    ...overrides
  }
}

// ── 清理 ───────────────────────────────────────────────────

beforeEach(() => {
  storeData.clear()
  eventBus.clear()
})

// ═══════════════════════════════════════════════════════════════
// Conferences
// ═══════════════════════════════════════════════════════════════

describe('Conference data layer', () => {
  describe('listConferences', () => {
    it('空 store 返回 []', () => {
      expect(listConferences()).toEqual([])
    })

    it('store 有数据时返回摘要列表', () => {
      const conf = makeConference()
      storeData.set('conferences', [conf])

      const result = listConferences()
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('conf-1')
      expect(result[0].name).toBe('Test Conference')
      expect(result[0].phase).toBe('general_debate')
      // 摘要不包含 minutes
      expect((result[0] as ConferenceEntry).minutes).toBeUndefined()
    })
  })

  describe('getConference', () => {
    it('store 为空 → null', () => {
      expect(getConference('any')).toBeNull()
    })

    it('找不到指定 id → null', () => {
      storeData.set('conferences', [makeConference()])
      expect(getConference('nonexistent')).toBeNull()
    })

    it('找到指定 id → 返回完整对象（含 minutes）', () => {
      const conf = makeConference()
      storeData.set('conferences', [conf])

      const result = getConference('conf-1')
      expect(result).not.toBeNull()
      expect(result!.id).toBe('conf-1')
      expect(result!.minutes).toHaveLength(3)
    })
  })

  describe('getMinutes', () => {
    it('会议无 minutes → []', () => {
      const conf = makeConference({ minutes: undefined })
      storeData.set('conferences', [conf])
      expect(getMinutes('conf-1')).toEqual([])
    })

    it('返回最近 N 条，倒序（最新在前）', () => {
      storeData.set('conferences', [makeConference()])

      const result = getMinutes('conf-1', 2)
      expect(result).toHaveLength(2)
      // 最新的在前：min-3 (timestamp 3000) 在前
      expect(result[0].id).toBe('min-3')
      expect(result[1].id).toBe('min-2')
    })

    it('默认 limit=10', () => {
      storeData.set('conferences', [makeConference()])
      // 只有 3 条，全部返回
      expect(getMinutes('conf-1')).toHaveLength(3)
    })
  })

  describe('updateConference', () => {
    it('找不到 id → null', () => {
      storeData.set('conferences', [])
      expect(updateConference('nonexistent', { phase: 'voting' })).toBeNull()
    })

    it('update phase → 落盘 + 返回更新对象', () => {
      const conf = makeConference()
      storeData.set('conferences', [conf])

      const updated = updateConference('conf-1', { phase: 'voting' })
      expect(updated).not.toBeNull()
      expect(updated!.phase).toBe('voting')

      // 验证持久化：再读一次
      const reloaded = getConference('conf-1')
      expect(reloaded!.phase).toBe('voting')
    })

    it('update phase 变更 → emit conference:phase_changed', () => {
      storeData.set('conferences', [makeConference()])

      const handler = vi.fn()
      eventBus.on('conference:phase_changed', handler)

      updateConference('conf-1', { phase: 'voting' })

      expect(handler).toHaveBeenCalledTimes(1)
      const payload = handler.mock.calls[0][0]
      expect(payload.type).toBe('conference:phase_changed')
      expect(payload.data).toMatchObject({
        conferenceId: 'conf-1',
        prevPhase: 'general_debate',
        phase: 'voting'
      })
    })

    it('update phase 未变更时不 emit', () => {
      storeData.set('conferences', [makeConference({ phase: 'voting' })])

      const handler = vi.fn()
      eventBus.on('conference:*', handler)

      updateConference('conf-1', { phase: 'voting' }) // same value

      expect(handler).not.toHaveBeenCalled()
    })

    it('设置 currentSpeaker → emit conference:speaker_started', () => {
      storeData.set('conferences', [makeConference()])

      const handler = vi.fn()
      eventBus.on('conference:speaker_started', handler)

      updateConference('conf-1', {
        currentSpeaker: { seat: 'USA', remaining: 120 }
      })

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler.mock.calls[0][0].data).toMatchObject({
        conferenceId: 'conf-1',
        seat: 'USA',
        remaining: 120
      })
    })

    it('移除 currentSpeaker（传 null）→ emit conference:speaker_finished', () => {
      storeData.set('conferences', [
        makeConference({ currentSpeaker: { seat: 'USA', remaining: 60 } })
      ])

      const handler = vi.fn()
      eventBus.on('conference:speaker_finished', handler)

      // 用 null 表示"移除 speaker"（undefined 被 patch 语义视为"不设置此字段"）
      updateConference('conf-1', { currentSpeaker: null as unknown as undefined })

      expect(handler).toHaveBeenCalledTimes(1)
    })
  })
})

// ═══════════════════════════════════════════════════════════════
// Timelines
// ═══════════════════════════════════════════════════════════════

describe('Timeline data layer', () => {
  describe('listTimelines', () => {
    it('空 store 返回 []', () => {
      expect(listTimelines()).toEqual([])
    })

    it('store 有数据时返回摘要列表', () => {
      const tl = makeTimeline()
      storeData.set('tools', [tl])

      const result = listTimelines()
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('tl-1')
      expect(result[0].name).toBe('Test Timeline')
      expect(result[0].paused).toBe(false)
      expect(result[0].ratio).toBe(60)
    })
  })

  describe('getTimeline', () => {
    it('store 为空 → null', () => {
      expect(getTimeline('any')).toBeNull()
    })

    it('找不到指定 id → null', () => {
      storeData.set('tools', [makeTimeline()])
      expect(getTimeline('nonexistent')).toBeNull()
    })

    it('找到指定 id → 返回完整对象', () => {
      storeData.set('tools', [makeTimeline()])

      const result = getTimeline('tl-1')
      expect(result).not.toBeNull()
      expect(result!.id).toBe('tl-1')
      expect(result!.state.paused).toBe(false)
    })
  })

  describe('updateTimeline', () => {
    it('找不到 id → null', () => {
      storeData.set('tools', [])
      expect(updateTimeline('nonexistent', { paused: true })).toBeNull()
    })

    it('pause → emit timeline:paused', () => {
      storeData.set('tools', [makeTimeline()])

      const handler = vi.fn()
      eventBus.on('timeline:paused', handler)

      const updated = updateTimeline('tl-1', { paused: true })
      expect(updated).not.toBeNull()
      expect(updated!.state.paused).toBe(true)

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler.mock.calls[0][0].data).toMatchObject({
        timelineId: 'tl-1',
        paused: true
      })
    })

    it('resume → emit timeline:resumed', () => {
      const initialState: TimelineState = {
        paused: true,
        ratio: 1,
        simulationAnchor: 0,
        realAnchor: Date.now()
      }
      storeData.set('tools', [makeTimeline({ state: initialState })])

      const handler = vi.fn()
      eventBus.on('timeline:resumed', handler)

      updateTimeline('tl-1', { paused: false })

      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('paused 未变更时不 emit', () => {
      storeData.set('tools', [makeTimeline()])

      const handler = vi.fn()
      eventBus.on('timeline:*', handler)

      updateTimeline('tl-1', { paused: false }) // same value

      expect(handler).not.toHaveBeenCalled()
    })

    it('ratio 变更 → emit timeline:ratio_changed', () => {
      storeData.set('tools', [makeTimeline()])

      const handler = vi.fn()
      eventBus.on('timeline:ratio_changed', handler)

      updateTimeline('tl-1', { ratio: 3600 })

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler.mock.calls[0][0].data).toMatchObject({
        timelineId: 'tl-1',
        prevRatio: 60,
        ratio: 3600
      })
    })

    it('更新持久化到 store', () => {
      storeData.set('tools', [makeTimeline()])

      updateTimeline('tl-1', { ratio: 86400 })

      // 重新读取验证
      const reloaded = getTimeline('tl-1')
      expect(reloaded!.state.ratio).toBe(86400)
    })
  })
})
