import { afterEach, describe, expect, it, vi } from 'vitest'
import { translate } from '$lib/i18n'
import { applyLocale } from '$lib/i18n'
import { Committee } from './committee.svelte'
import { MOTION_LABELS, POINT_LABELS, ACTION_LABELS } from '$lib/classes/types/committee'
import { CAPABILITY_LABELS, CAPABILITY_OPTIONS } from '$lib/classes/types/delegate'
import { PHASE_LABELS } from '$lib/classes/utils/committee/phase'
import { getEntryDescription } from '$lib/classes/utils/committee/entry-description'
import { buildDisplayData } from '$lib/classes/clients/conference-display-client'
import { createTimer, destroyAllTimers, getTimer } from '$lib/classes/services/timer/timer'
import { emitServiceEvent } from '$lib/classes/services/event-bus-bridge'

vi.mock('$lib/classes/services/event-bus-bridge', () => ({ emitServiceEvent: vi.fn() }))

afterEach(() => {
  applyLocale('zh-CN')
  destroyAllTimers()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('committee localization', () => {
  it('updates existing label records and options without rebuilding them', () => {
    const labels = MOTION_LABELS
    const option = CAPABILITY_OPTIONS.find((item) => item.value === 'view_conference')!
    expect(labels.open_speakers_list).toBe('开启主发言名单')
    expect(option.label).toBe('查看会议状态')
    applyLocale('en-US')
    expect(labels.open_speakers_list).toBe('Open the speakers list')
    expect(POINT_LABELS.point_of_order).toBe('Point of order')
    expect(ACTION_LABELS.phase_changed).toBe('Phase changed')
    expect(PHASE_LABELS.voting).toBe('Voting')
    expect(option.label).toBe(CAPABILITY_LABELS.view_conference)
    expect(option.label).toBe('View meeting status')
  })

  it('captures original names and user text in structured logs and isolates serialization', () => {
    const committee = new Committee({ phase: 'general_debate' })
    const seatId = committee.addSeat('中国 {name}', 'group')
    committee.proposeMotion({
      type: 'moderated_debate',
      proposedBySeatId: seatId,
      topic: '气候安全 {topic}',
      durationSec: 300
    })
    const entry = committee.minutes.at(-1)!
    expect(entry.messageKey).toBe('domain_log_motion')
    expect(entry.messageValues).toMatchObject({
      name: '中国 {name}',
      topic: '气候安全 {topic}',
      type: 'moderated_debate'
    })
    committee.updateSeat(seatId, { name: 'New name' })
    const serialized = committee.toJSON()
    const restored = Committee.fromJSON(serialized)
    serialized.minutes.at(-1)!.messageValues!.name = 'Changed snapshot'
    expect(restored.minutes.at(-1)!.messageValues!.name).toBe('中国 {name}')
    expect(entry.messageValues!.name).toBe('中国 {name}')
    expect(getEntryDescription(entry, 'en-US')).toBe(
      '中国 {name} proposed a motion: Moderated debate: 气候安全 {topic}'
    )
    expect(entry.description).toBe('中国 {name} 提出动议: 有主持的辩论: 气候安全 {topic}')
  })

  it('keeps legacy descriptions unchanged and does not emit events when translating or restoring', () => {
    const committee = new Committee()
    committee.addConferenceEntry('phase_changed', '历史中文与用户内容')
    committee.closeMeeting()
    const entries = committee.toJSON().minutes
    vi.mocked(emitServiceEvent).mockClear()
    applyLocale('en-US')
    expect(getEntryDescription(entries[0])).toBe('历史中文与用户内容')
    expect(
      getEntryDescription({
        ...entries[0],
        messageKey: 'future_message' as (typeof entries)[0]['messageKey']
      })
    ).toBe('历史中文与用户内容')
    expect(getEntryDescription(entries.at(-1)!)).toBe('Phase entered: Closed')
    expect(Committee.fromJSON(committee.toJSON()).minutes).toEqual(entries)
    expect(emitServiceEvent).not.toHaveBeenCalled()
    expect(committee.minutes).toHaveLength(entries.length)
  })

  it('preserves roll-call counts after attendance changes', () => {
    const committee = new Committee({ phase: 'roll_call' })
    const seatId = committee.addSeat(
      '中国',
      'group',
      undefined,
      {},
      { attendance: 'present', hasVotingRights: true, sortOrder: 0 }
    )
    committee.completeRollCall()
    const entry = committee.minutes.find((item) => item.actionType === 'roll_call_completed')!
    committee.setAttendance(seatId, 'absent')
    expect(entry.messageValues).toMatchObject({
      present: 1,
      voters: 1,
      denominator: 1,
      required: 1,
      countedPresent: 1
    })
    expect(getEntryDescription(entry, 'en-US')).toContain('1/1 present')
  })

  it('records observer and absent snapshots and copies caller-supplied message values', () => {
    const committee = new Committee({ phase: 'roll_call' })
    committee.addSeat(
      '中国',
      'group',
      undefined,
      {},
      { attendance: 'present', hasVotingRights: true, sortOrder: 0 }
    )
    committee.addSeat(
      '观察员',
      'group',
      undefined,
      {},
      { attendance: 'present', hasVotingRights: false, sortOrder: 1 }
    )
    committee.addSeat(
      '法国',
      'group',
      undefined,
      {},
      { attendance: 'absent', hasVotingRights: true, sortOrder: 2 }
    )
    committee.completeRollCall()
    const entry = committee.minutes.find((item) => item.actionType === 'roll_call_completed')!
    expect(entry.description).toBe(
      '点名完成: 实到 2/3（含观察员 1），可投票 1；法定人数按 3 席计，实际计入 2 席，需要 2 席；缺席: 法国'
    )
    expect(getEntryDescription(entry, 'en-US')).toBe(
      'Roll call completed: 2/3 present (1 observers), 1 eligible voters; quorum basis: 3, 2 counted, 2 required; absent: 法国'
    )
    const values = { name: '原始姓名', seconds: 120 }
    committee.addConferenceEntry('speaker_started', {
      messageKey: 'domain_log_speaker_started',
      messageValues: values
    })
    values.name = '被修改的姓名'
    expect(committee.minutes.at(-1)!.messageValues!.name).toBe('原始姓名')
  })

  it('projects machine voting enums and locale without changing timers or procedure state', () => {
    vi.useFakeTimers()
    const committee = new Committee({ phase: 'general_debate' })
    committee.addSeat(
      '中国',
      'group',
      undefined,
      {},
      {
        attendance: 'present',
        hasVotingRights: true,
        sortOrder: 0
      }
    )
    committee.substantiveVotingMajority = 'simple_majority'
    committee.startVotingSession('resolution', 'draft', 'simple_majority')
    const timer = createTimer('i18n-test')
    const onExpire = vi.fn()
    timer.start(120, vi.fn(), onExpire, 17)
    const before = committee.toJSON()
    const beforeElapsed = timer.elapsedSec
    applyLocale('en-US')
    const projection = buildDisplayData(committee)
    expect(projection.locale).toBe('en-US')
    expect(projection.votingSession).toMatchObject({
      majorityRule: 'simple_majority',
      targetType: 'resolution'
    })
    expect(projection.recentMinutes.at(-1)?.messageKey).toBe('domain_log_phase')
    expect(committee.toJSON()).toEqual(before)
    expect(getTimer('i18n-test')).toBe(timer)
    expect(timer.isRunning).toBe(true)
    expect(timer.elapsedSec).toBeGreaterThanOrEqual(beforeElapsed)
    expect(onExpire).not.toHaveBeenCalled()
    expect(
      translate(before.minutes.at(-2)!.messageKey!, before.minutes.at(-2)!.messageValues, 'en-US')
    ).toBe('Voting started (simple majority)')
  })
})
