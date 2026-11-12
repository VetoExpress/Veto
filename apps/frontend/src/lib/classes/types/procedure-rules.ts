import type { MajorityRule, MotionType } from './committee'
import type { ParticipantSeat } from './delegate'

export type ThresholdRule = { type: MajorityRule } | { type: 'fixed'; value: number }
export type AttendanceBasis = 'all_participants' | 'voting_eligible'
export type VoteDenominator = 'present_participants' | 'present_voting_eligible' | 'yes_no'

export interface ProcedureRulesConfig {
  quorum: { denominator: AttendanceBasis; threshold: ThresholdRule }
  proceduralVote: {
    denominator: Exclude<VoteDenominator, 'yes_no'>
    /** Null preserves each motion's existing majority policy. */
    threshold: ThresholdRule | null
    overrides: Partial<Record<MotionType, ThresholdRule>>
  }
  documentVote: {
    denominator: Exclude<VoteDenominator, 'present_participants'>
    ratio: MajorityRule
  }
  veto: { enabled: boolean; seatIds: string[] }
}

export interface QuorumEvaluation {
  denominator: number
  present: number
  required: number
  met: boolean
}

export interface VotingRulesSnapshot {
  kind: 'procedural' | 'document'
  denominator: VoteDenominator
  threshold: ThresholdRule
  /** The electorate, attendance and labels are fixed when the vote starts. */
  seats: ParticipantSeat[]
  vetoSeatIds: string[]
}

export interface VoteEvaluation {
  denominator: number
  required: number
  yes: number
  no: number
  abstain: number
  vetoSeatIds: string[]
  result: 'passed' | 'failed' | 'incomplete' | 'invalid'
}

export interface QuorumRecord {
  rules: ProcedureRulesConfig['quorum']
  evaluation: QuorumEvaluation
  checkedAt: number
}
