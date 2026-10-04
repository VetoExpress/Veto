import { describe, expect, it, vi } from 'vitest'
import { Committee } from '$lib/classes/domain/committee.svelte'
import { makeCheckpoint, restoreCheckpoint } from './committee-checkpoints'

vi.mock('$lib/classes/clients/conference-display-client', () => ({ getDisplayBridge: () => ({ sendUpdate: vi.fn() }), buildDisplayData: vi.fn() }))

describe('会议快照恢复', () => {
  it('preserves speaking queue, elapsed time and ballots across serialization and pauses timers', () => {
    const committee = new Committee({ id: 'committee', phase: 'general_debate' })
    const seatId = committee.addSeat('中国', 'group', undefined, {}, { attendance: 'present', hasVotingRights: true, sortOrder: 0 })
    const entry = committee.addToSpeakersList(seatId, 120)
    committee.startSpeakingEntry(entry)
    committee.activeSpeaker = { ...committee.activeSpeaker!, elapsedSec: 37 }
    committee.activeCaucus = { motionId: 'motion', type: 'unmoderated', totalSec: 600, elapsedSec: 150, paused: false }
    const snapshot = makeCheckpoint('conference', committee, '测试')
    committee.updateSeat(seatId, { name: '中国（新名称）', userId: 'new-user' })
    committee.activeSpeaker = null
    const restored = restoreCheckpoint(JSON.parse(JSON.stringify(snapshot)), 'conference', committee)
    expect(restored.activeSpeaker).toMatchObject({ elapsedSec: 37, totalSec: 120, paused: true })
    expect(restored.activeCaucus).toMatchObject({ elapsedSec: 150, paused: true })
    expect(restored.speakerLists.entries[0]).toMatchObject({ id: entry, seatId, status: 'speaking' })
    expect(restored.seats[0]).toMatchObject({ name: '中国（新名称）', userId: 'new-user' })
    expect(JSON.stringify(snapshot)).not.toContain('new-user')
    expect(snapshot.data.activeSpeaker?.paused).toBe(false)
  })
  it('does not restore snapshots across committees or revive removed seats', () => {
    const committee = new Committee({ id: 'committee' })
    const id = committee.addSeat('代表', 'group')
    const snapshot = makeCheckpoint('conference', committee, '测试')
    expect(() => restoreCheckpoint(snapshot, 'other', committee)).toThrow('不属于')
    committee.removeSeat(id)
    expect(() => restoreCheckpoint(snapshot, 'conference', committee)).toThrow('席位已移除')
  })
  it('round trips an active voting session without changing ballots', () => {
    const committee = new Committee({ phase: 'voting' })
    committee.votingSessions = [{ id: 'vote', ballots: [{ seatId: 'seat', vote: 'yes' }], status: 'in_progress' } as unknown as typeof committee.votingSessions[number]]
    const restored = restoreCheckpoint(makeCheckpoint('c', committee, '表决'), 'c', committee)
    expect(restored.phase).toBe('voting')
    expect(restored.votingSessions).toEqual(committee.votingSessions)
  })
})
