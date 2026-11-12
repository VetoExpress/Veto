import { describe, expect, it } from 'vitest'
import type { ParticipantSeat } from '$lib/classes/types/delegate'
import type { VoteBallot } from '$lib/classes/types/committee'
import {
  calculateQuorum,
  createVotingSnapshot,
  defaultProcedureRules,
  evaluateVote,
  proceduralThreshold,
  thresholdCount,
  validateProcedureRules
} from './procedure-rules'

const seats = (n: number): ParticipantSeat[] =>
  Array.from({ length: n }, (_, i) => ({
    id: String(i),
    name: String(i),
    seatGroupId: 'g',
    capabilityOverrides: {},
    procedure: { attendance: 'present', hasVotingRights: true, sortOrder: i }
  }))
const votes = (yes: number, no: number, abstain = 0): VoteBallot[] =>
  Array.from({ length: yes + no + abstain }, (_, i) => ({
    seatId: String(i),
    vote: i < yes ? 'yes' : i < yes + no ? 'no' : 'abstain'
  }))

describe('procedure decisions', () => {
  it('counts quorum numerator and denominator from the same eligibility set', () => {
    const roster = seats(5)
    roster[0].procedure.hasVotingRights = false
    roster[1].procedure.hasVotingRights = false
    roster[3].procedure.attendance = 'absent'
    roster[4].procedure.attendance = 'absent'
    const rules = defaultProcedureRules()
    expect(calculateQuorum(roster, rules.quorum)).toEqual({
      denominator: 5,
      present: 3,
      required: 3,
      met: true
    })
    rules.quorum.denominator = 'voting_eligible'
    expect(calculateQuorum(roster, rules.quorum)).toEqual({
      denominator: 3,
      present: 1,
      required: 2,
      met: false
    })
    rules.quorum.threshold = { type: 'fixed', value: 1 }
    expect(calculateQuorum(roster, rules.quorum).met).toBe(true)
    expect(calculateQuorum([], rules.quorum).met).toBe(false)
  })

  it.each([1, 2, 3, 4, 5, 14, 15, 40])('rounds thresholds exactly for %i seats', (n) => {
    expect(thresholdCount(n, { type: 'simple_majority' })).toBe(Math.floor(n / 2) + 1)
    expect(thresholdCount(n, { type: 'two_thirds' })).toBe(Math.ceil((n * 2) / 3))
  })

  it('uses yes/no rather than attendance for document votes when configured', () => {
    const rules = defaultProcedureRules()
    rules.documentVote.denominator = 'yes_no'
    expect(
      evaluateVote(votes(8, 3, 4), createVotingSnapshot(rules, seats(15), 'document'))
    ).toMatchObject({
      denominator: 11,
      required: 8,
      result: 'passed'
    })
    rules.documentVote.denominator = 'present_voting_eligible'
    expect(
      evaluateVote(votes(8, 3, 4), createVotingSnapshot(rules, seats(15), 'document')).result
    ).toBe('failed')
  })

  it('handles simple majority ties and all-abstention without zero-vote passage', () => {
    const rules = defaultProcedureRules('simple_majority')
    rules.documentVote.denominator = 'yes_no'
    expect(
      evaluateVote(votes(2, 2), createVotingSnapshot(rules, seats(4), 'document')).result
    ).toBe('failed')
    rules.documentVote.ratio = 'two_thirds'
    expect(
      evaluateVote(votes(0, 0, 4), createVotingSnapshot(rules, seats(4), 'document')).result
    ).toBe('failed')
    expect(evaluateVote([], createVotingSnapshot(rules, [], 'document')).result).toBe('invalid')
  })

  it('applies vetoes only to document no votes, never abstentions or procedural votes', () => {
    const rules = defaultProcedureRules()
    rules.veto = { enabled: true, seatIds: ['14'] }
    const document = createVotingSnapshot(rules, seats(15), 'document')
    expect(evaluateVote(votes(14, 1), document)).toMatchObject({
      result: 'failed',
      vetoSeatIds: ['14']
    })
    expect(evaluateVote(votes(14, 0, 1), document).result).toBe('passed')
    expect(
      evaluateVote(votes(14, 1), createVotingSnapshot(rules, seats(15), 'procedural')).result
    ).toBe('passed')
  })

  it('preserves per-motion policies until explicitly overridden', () => {
    const rules = defaultProcedureRules()
    expect(proceduralThreshold(rules, 'closure_debate')).toEqual({ type: 'two_thirds' })
    expect(proceduralThreshold(rules, 'suspend_meeting')).toEqual({ type: 'simple_majority' })
    rules.proceduralVote.threshold = { type: 'fixed', value: 9 }
    expect(proceduralThreshold(rules, 'closure_debate')).toEqual({ type: 'fixed', value: 9 })
  })

  it('counts nonvoting observers in the denominator only when selected, without giving them ballots', () => {
    const roster = seats(5)
    roster[4].procedure.hasVotingRights = false
    const rules = defaultProcedureRules()
    rules.proceduralVote.threshold = { type: 'two_thirds' }
    rules.proceduralVote.denominator = 'present_participants'
    expect(
      evaluateVote(votes(3, 1), createVotingSnapshot(rules, roster, 'procedural'))
    ).toMatchObject({ denominator: 5, required: 4, result: 'failed' })
    rules.proceduralVote.denominator = 'present_voting_eligible'
    expect(
      evaluateVote(votes(3, 1), createVotingSnapshot(rules, roster, 'procedural')).result
    ).toBe('passed')
  })

  it('rejects missing, duplicate, ineligible and unresolved pass ballots', () => {
    const snapshot = createVotingSnapshot(defaultProcedureRules(), seats(3), 'document')
    expect(evaluateVote(votes(2, 0), snapshot).result).toBe('incomplete')
    expect(evaluateVote([...votes(3, 0), votes(1, 0)[0]], snapshot).result).toBe('invalid')
    expect(
      evaluateVote([...votes(3, 0), { seatId: 'outsider', vote: 'yes' }], snapshot).result
    ).toBe('invalid')
    expect(evaluateVote([...votes(2, 0), { seatId: '2', vote: 'skip' }], snapshot).result).toBe(
      'incomplete'
    )
  })

  it('validates positive fixed thresholds and veto membership while allowing absent veto seats', () => {
    const roster = seats(3)
    roster[2].procedure.attendance = 'absent'
    const rules = defaultProcedureRules()
    rules.veto = { enabled: true, seatIds: ['2'] }
    expect(validateProcedureRules(rules, roster)).toBe(true)
    rules.quorum.threshold = { type: 'fixed', value: 0 }
    expect(validateProcedureRules(rules, roster)).toBe(false)
    rules.quorum.threshold = { type: 'fixed', value: 1.5 }
    expect(validateProcedureRules(rules, roster)).toBe(false)
    rules.quorum.threshold = { type: 'fixed', value: 1 }
    rules.veto.seatIds = ['unknown']
    expect(validateProcedureRules(rules, roster)).toBe(false)
  })
})
