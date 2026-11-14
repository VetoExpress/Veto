import { describe, expect, it, vi } from 'vitest'
import { Committee } from './committee.svelte'
import { calculateQuorum, defaultProcedureRules } from '../utils/committee/procedure-rules'
import { buildDisplayData } from '../clients/conference-display-client'

vi.mock('$lib/classes/services/event-bus-bridge', () => ({ emitServiceEvent: vi.fn() }))

function committee(n = 5) {
  const c = new Committee({ phase: 'roll_call' })
  const ids = Array.from({ length: n }, (_, i) =>
    c.addSeat(
      `Seat ${i}`,
      'g',
      undefined,
      {},
      {
        attendance: 'present',
        hasVotingRights: true,
        sortOrder: i
      }
    )
  )
  return { c, ids }
}

describe('committee rule integration', () => {
  it('blocks quorum failure, retains pending vote transition, and permits later completion', () => {
    const { c, ids } = committee()
    c.postRollCallPhase = 'voting'
    ids.slice(2).forEach((id) => c.setAttendance(id, 'absent'))
    expect(c.completeRollCall()).toBe(false)
    expect(c.phase).toBe('roll_call')
    expect(c.postRollCallPhase).toBe('voting')
    expect(c.quorumRecord?.evaluation).toMatchObject({ required: 3, present: 2, met: false })
    c.setAttendance(ids[2], 'present')
    expect(c.completeRollCall()).toBe(true)
    expect(c.phase).toBe('voting')
  })

  it('projects live quorum while the next roll call is in progress', () => {
    const { c, ids } = committee()
    c.phase = 'roll_call'
    c.completeRollCall()
    c.setAttendance(ids[4], 'absent')
    c.phase = 'roll_call'
    const live = calculateQuorum(c.participantSeats, c.procedureRules.quorum)
    const projection = buildDisplayData(c, {
      rollCall: {
        currentIndex: 0,
        totalCount: 5,
        presentCount: live.present,
        simpleMajorityThreshold: 1,
        twoThirdsThreshold: 1
      }
    })
    expect(c.quorumRecord?.evaluation.present).toBe(5)
    expect(projection.quorum).toEqual(live)
    expect(projection.rollCall?.quorum).toEqual(live)
  })

  it('freezes rules, names, electorate and vetoes across edits and restart', () => {
    const { c, ids } = committee()
    const rules = defaultProcedureRules()
    rules.documentVote.denominator = 'yes_no'
    rules.veto = { enabled: true, seatIds: [ids[4]] }
    expect(c.setProcedureRules(rules)).toBe(true)
    const id = c.startVotingSession('resolution', 'draft', 'two_thirds')
    c.castVote(id, ids[0], 'skip')
    c.setAttendance(ids[1], 'absent')
    c.updateSeat(ids[4], { name: 'Renamed' })
    expect(c.setProcedureRules(defaultProcedureRules('simple_majority'))).toBe(true)
    const restored = Committee.fromJSON(c.toJSON())
    for (const seat of ids.slice(1, 4)) restored.castVote(id, seat, 'yes')
    restored.castVote(id, ids[4], 'no')
    expect(restored.votingSessions[0].round).toBe(2)
    restored.castVote(id, ids[0], 'abstain')
    expect(restored.votingSessions[0].currentSeatId).toBe(ids[0])
    restored.castVote(id, ids[0], 'yes')
    restored.closeVotingSession(id)
    expect(restored.votingSessions[0]).toMatchObject({
      result: 'failed',
      evaluation: { yes: 4, no: 1, required: 4, vetoSeatIds: [ids[4]] }
    })
    expect(restored.votingSessions[0].rulesSnapshot?.seats[4].name).toBe('Seat 4')
    expect(buildDisplayData(restored).votingSession).toMatchObject({
      rules: {
        kind: 'document',
        denominator: 'yes_no',
        threshold: { type: 'two_thirds' }
      },
      evaluation: { yes: 4, no: 1, abstain: 0, required: 4, result: 'failed' },
      ballots: expect.arrayContaining([
        expect.objectContaining({ seatId: ids[4], seatName: 'Seat 4', vote: 'no' })
      ])
    })
    const json = restored.toJSON()
    json.votingSessions[0].rulesSnapshot!.vetoSeatIds.length = 0
    expect(restored.votingSessions[0].rulesSnapshot?.vetoSeatIds).toEqual([ids[4]])
  })

  it('keeps seat veto flags synchronized with the committee rule snapshot', () => {
    const { c, ids } = committee(2)
    expect(c.getSeat(ids[1])?.procedure?.hasVetoPower).toBe(false)

    const rules = defaultProcedureRules()
    rules.veto = { enabled: true, seatIds: [ids[1]] }
    expect(c.setProcedureRules(rules)).toBe(true)
    expect(c.getSeat(ids[1])?.procedure?.hasVetoPower).toBe(true)

    expect(c.setProcedureRules(defaultProcedureRules())).toBe(true)
    expect(c.getSeat(ids[1])?.procedure?.hasVetoPower).toBe(false)
  })

  it('preserves legacy majority configuration and completed outcomes', () => {
    const { c } = committee()
    const data = c.toJSON()
    delete data.procedureRules
    data.substantiveVotingMajority = 'simple_majority'
    data.votingSessions = [
      {
        id: 'old',
        targetType: 'resolution',
        targetId: 'old-draft',
        majorityRule: 'two_thirds',
        ballots: [],
        startedAt: 1,
        endedAt: 2,
        currentSeatId: null,
        round: 1,
        result: 'passed'
      }
    ]
    const restored = Committee.fromJSON(data)
    expect(restored.procedureRules.documentVote.ratio).toBe('simple_majority')
    expect(restored.votingSessions[0].result).toBe('passed')
    expect(restored.votingSessions[0].rulesSnapshot).toBeUndefined()
  })

  it('does not create empty votes or overlapping active sessions', () => {
    const empty = new Committee()
    expect(empty.startVotingSession('resolution', 'draft', 'two_thirds')).toBe('')
    expect(empty.votingSessions).toHaveLength(0)
    const { c } = committee()
    expect(c.startVotingSession('resolution', 'first', 'two_thirds')).not.toBe('')
    expect(c.startVotingSession('resolution', 'second', 'two_thirds')).toBe('')
    expect(c.votingSessions).toHaveLength(1)
  })

  it('rejects corrupt configuration instead of replacing it with different rules', () => {
    const { c } = committee()
    const data = c.toJSON()
    data.procedureRules!.quorum.threshold = { type: 'fixed', value: -1 }
    expect(() => Committee.fromJSON(data)).toThrow()
  })
})
