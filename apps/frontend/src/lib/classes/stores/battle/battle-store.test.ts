import { beforeEach, describe, expect, it, vi } from 'vitest'
import { get } from 'svelte/store'

vi.mock('$lib/classes/services/plugin/mod-registry.svelte', () => ({
  registry: { getMod: vi.fn() }, mods: {}
}))
vi.mock('$lib/classes/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))
vi.mock('../../helpers/store-bridge', () => ({
  bootstrapStore: vi.fn(async () => []), saveToStore: vi.fn(async () => {}), deleteFromStore: vi.fn()
}))

import {
  battles, battlesReady, createBattle, getConferenceBattle, loadBattle,
  currentBattle, currentBattleId, flushRuntimePositions, saveBattlesNow
} from './battle-store'
import { gameClock, initGameClock } from '$lib/classes/services/engine/game-clock.store'
import { saveToStore } from '../../helpers/store-bridge'

beforeEach(async () => {
  await battlesReady
  battles.set([])
  currentBattleId.set(null)
  vi.clearAllMocks()
})

describe('conference-owned battles', () => {
  it('keeps conference states isolated and requires a conference', () => {
    createBattle('大会 A', { conferenceId: 'a', mapCenter: [30, 120] })
    createBattle('大会 B', { conferenceId: 'b', mapCenter: [40, 110] })
    expect(getConferenceBattle('a')?.mapCenter).toEqual([30, 120])
    expect(getConferenceBattle('b')?.mapCenter).toEqual([40, 110])
    expect(getConferenceBattle('c')).toBeNull()
    expect(() => createBattle('无大会', { conferenceId: '' })).toThrow('战局必须属于一个大会')
  })

  it('reuses the conference state when initialization is submitted again', () => {
    const id = createBattle('原始配置', { conferenceId: 'a', timeScale: 3600 })
    createBattle('其他大会', { conferenceId: 'b' })
    expect(createBattle('重复配置', { conferenceId: 'a', timeScale: 60 })).toBe(id)
    expect(get(battles)).toHaveLength(2)
    expect(get(currentBattle)?.timeScale).toBe(3600)
    expect(get(currentBattle)?.name).toBe('原始配置')
  })

  it('persists ownership and resumes the saved clock paused, even without units', async () => {
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      setItem: (key: string, value: string) => storage.set(key, value)
    })
    try {
      const id = createBattle('推演', { conferenceId: 'a', startDate: '2026-01-01' })
      initGameClock(getConferenceBattle('a')!)
      gameClock.update((clock) => ({ ...clock, currentDate: new Date('2026-01-02T00:00:00Z'), timeScale: 3600, isPaused: false }))
      flushRuntimePositions()
      await saveBattlesNow()
      const persisted = JSON.parse(storage.get('wars_battles')!)
      expect(persisted[0].conferenceId).toBe('a')
      expect(saveToStore).toHaveBeenCalledWith('battles', persisted)
      battles.set(persisted)
      loadBattle(id)
      initGameClock(getConferenceBattle('a')!)
      expect(get(gameClock).currentDate.toISOString()).toBe('2026-01-02T00:00:00.000Z')
      expect(get(gameClock).timeScale).toBe(3600)
      expect(get(gameClock).isPaused).toBe(true)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('does not assign legacy independent battles to a conference', () => {
    createBattle('旧战局', { conferenceId: 'a' })
    battles.update((list) => list.map(({ conferenceId, ...legacy }) => legacy))
    expect(getConferenceBattle('a')).toBeNull()
  })
})
