/**
 * data/index.ts — 统一数据层入口
 *
 * 所有应用数据的读写都通过本模块：
 *
 *   import { listConferences, updateConference, listTimelines, loadStore } from './data'
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │ store.ts       — 底层 JSON 文件读写                          │
 * │ conferences.ts — 会议 CRUD + 自动 emit 事件                  │
 * │ timelines.ts   — 时间线 CRUD + 自动 emit 事件                │
 * └─────────────────────────────────────────────────────────────┘
 */

export { loadStore, saveStore, deleteStore, migrateFromLocalStorage } from './store'
export type { StoreDomain } from './store'

export { listConferences, getConference, getMinutes, updateConference } from './conferences'
export type { ConferenceEntry, ConferenceSummary, MinutesEntry } from './conferences'

export { listTimelines, getTimeline, updateTimeline } from './timelines'
export type { TimelineEntry, TimelineState, TimelineSummary } from './timelines'
