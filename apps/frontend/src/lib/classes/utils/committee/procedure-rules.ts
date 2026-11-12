import type { MajorityRule, MotionType, VoteBallot } from '$lib/classes/types/committee'
import type { ParticipantSeat } from '$lib/classes/types/delegate'
import type {
  ProcedureRulesConfig,
  QuorumEvaluation,
  ThresholdRule,
  VoteEvaluation,
  VotingRulesSnapshot
} from '$lib/classes/types/procedure-rules'
import { resolveMotion } from './motions'

export function defaultProcedureRules(
  legacyMajority: MajorityRule = 'two_thirds'
): ProcedureRulesConfig {
  return {
    quorum: { denominator: 'all_participants', threshold: { type: 'simple_majority' } },
    proceduralVote: { denominator: 'present_voting_eligible', threshold: null, overrides: {} },
    documentVote: { denominator: 'present_voting_eligible', ratio: legacyMajority },
    veto: { enabled: false, seatIds: [] }
  }
}

export function validThreshold(value: unknown): value is ThresholdRule {
  if (!value || typeof value !== 'object') return false
  const rule = value as ThresholdRule
  return (
    rule.type === 'simple_majority' ||
    rule.type === 'two_thirds' ||
    (rule.type === 'fixed' && Number.isSafeInteger(rule.value) && rule.value > 0)
  )
}

/** Reject malformed saved configuration instead of silently changing its meaning. */
export function validProcedureRulesShape(value: unknown): value is ProcedureRulesConfig {
  if (!value || typeof value !== 'object') return false
  const rules = value as ProcedureRulesConfig
  return (
    !!rules.quorum &&
    ['all_participants', 'voting_eligible'].includes(rules.quorum.denominator) &&
    validThreshold(rules.quorum.threshold) &&
    !!rules.proceduralVote &&
    ['present_participants', 'present_voting_eligible'].includes(
      rules.proceduralVote.denominator
    ) &&
    (rules.proceduralVote.threshold === null || validThreshold(rules.proceduralVote.threshold)) &&
    !!rules.proceduralVote.overrides &&
    typeof rules.proceduralVote.overrides === 'object' &&
    !Array.isArray(rules.proceduralVote.overrides) &&
    Object.values(rules.proceduralVote.overrides).every(validThreshold) &&
    !!rules.documentVote &&
    ['present_voting_eligible', 'yes_no'].includes(rules.documentVote.denominator) &&
    ['simple_majority', 'two_thirds'].includes(rules.documentVote.ratio) &&
    !!rules.veto &&
    typeof rules.veto.enabled === 'boolean' &&
    Array.isArray(rules.veto.seatIds) &&
    rules.veto.seatIds.every((id) => typeof id === 'string' && id.trim().length > 0) &&
    new Set(rules.veto.seatIds).size === rules.veto.seatIds.length
  )
}

export function validateProcedureRules(
  value: unknown,
  seats: ParticipantSeat[]
): value is ProcedureRulesConfig {
  if (!validProcedureRulesShape(value)) return false
  const eligible = new Set(
    seats.filter((seat) => seat.procedure.hasVotingRights).map((seat) => seat.id)
  )
  return (
    (!value.veto.enabled || value.veto.seatIds.length > 0) &&
    value.veto.seatIds.every((id) => eligible.has(id))
  )
}

export function cloneProcedureRules(rules: ProcedureRulesConfig): ProcedureRulesConfig {
  return {
    quorum: { ...rules.quorum, threshold: { ...rules.quorum.threshold } },
    proceduralVote: {
      ...rules.proceduralVote,
      threshold: rules.proceduralVote.threshold ? { ...rules.proceduralVote.threshold } : null,
      overrides: Object.fromEntries(
        Object.entries(rules.proceduralVote.overrides).map(([key, value]) => [key, { ...value }])
      )
    },
    documentVote: { ...rules.documentVote },
    veto: { ...rules.veto, seatIds: [...rules.veto.seatIds] }
  }
}

export function thresholdCount(n: number, rule: ThresholdRule): number {
  if (!Number.isSafeInteger(n) || n < 0 || !validThreshold(rule)) return Number.NaN
  if (rule.type === 'fixed') return rule.value
  if (rule.type === 'simple_majority') return Math.floor(n / 2) + 1
  // Equivalent to ceil(2n/3), without a floating-point ratio or multiplying n.
  return n - Math.floor(n / 3)
}

export function calculateQuorum(
  seats: ParticipantSeat[],
  config: ProcedureRulesConfig['quorum']
): QuorumEvaluation {
  const counted =
    config.denominator === 'voting_eligible'
      ? seats.filter((seat) => seat.procedure.hasVotingRights)
      : seats
  const denominator = counted.length
  const present = counted.filter((seat) => seat.procedure.attendance === 'present').length
  const required = thresholdCount(denominator, config.threshold)
  return {
    denominator,
    present,
    required,
    met: denominator > 0 && present > 0 && present >= required
  }
}

export function proceduralThreshold(
  config: ProcedureRulesConfig,
  motionType?: MotionType,
  fallbackMajority: MajorityRule = 'simple_majority'
): ThresholdRule {
  return {
    ...((motionType && config.proceduralVote.overrides[motionType]) ||
      config.proceduralVote.threshold || {
        type: motionType ? resolveMotion(motionType).votingMajority : fallbackMajority
      })
  }
}

export function cloneVotingSnapshot(snapshot: VotingRulesSnapshot): VotingRulesSnapshot {
  return {
    ...snapshot,
    threshold: { ...snapshot.threshold },
    vetoSeatIds: [...snapshot.vetoSeatIds],
    seats: snapshot.seats.map((seat) => ({
      ...seat,
      procedure: { ...seat.procedure },
      capabilityOverrides: { ...seat.capabilityOverrides }
    }))
  }
}

export function createVotingSnapshot(
  config: ProcedureRulesConfig,
  seats: ParticipantSeat[],
  kind: VotingRulesSnapshot['kind'],
  motionType?: MotionType,
  fallbackMajority?: MajorityRule
): VotingRulesSnapshot {
  return cloneVotingSnapshot({
    kind,
    denominator:
      kind === 'document' ? config.documentVote.denominator : config.proceduralVote.denominator,
    threshold:
      kind === 'document'
        ? { type: config.documentVote.ratio }
        : proceduralThreshold(config, motionType, fallbackMajority),
    vetoSeatIds: kind === 'document' && config.veto.enabled ? config.veto.seatIds : [],
    seats: [...seats].sort((a, b) => a.procedure.sortOrder - b.procedure.sortOrder)
  })
}

/** Pure, reproducible decision. Missing, duplicate and ineligible ballots never pass. */
export function evaluateVote(ballots: VoteBallot[], snapshot: VotingRulesSnapshot): VoteEvaluation {
  const voters = snapshot.seats.filter(
    (seat) => seat.procedure.attendance === 'present' && seat.procedure.hasVotingRights
  )
  const voterIds = new Set(voters.map((seat) => seat.id))
  const seen = new Set<string>()
  let invalid = voterIds.size !== voters.length || !validThreshold(snapshot.threshold)
  let yes = 0,
    no = 0,
    abstain = 0,
    skipped = 0
  const vetoSeatIds: string[] = []
  const vetoes = new Set(snapshot.kind === 'document' ? snapshot.vetoSeatIds : [])
  for (const ballot of ballots) {
    if (seen.has(ballot.seatId) || !voterIds.has(ballot.seatId)) invalid = true
    seen.add(ballot.seatId)
    if (ballot.vote === 'yes') yes++
    else if (ballot.vote === 'no') {
      no++
      if (vetoes.has(ballot.seatId)) vetoSeatIds.push(ballot.seatId)
    } else if (ballot.vote === 'abstain') abstain++
    else if (ballot.vote === 'skip') skipped++
    else invalid = true
  }
  const denominator =
    snapshot.denominator === 'yes_no'
      ? yes + no
      : snapshot.denominator === 'present_participants'
        ? snapshot.seats.filter((seat) => seat.procedure.attendance === 'present').length
        : voters.length
  const required = thresholdCount(denominator, snapshot.threshold)
  const result =
    invalid || voters.length === 0
      ? 'invalid'
      : seen.size !== voters.length || skipped > 0
        ? 'incomplete'
        : denominator === 0 || vetoSeatIds.length > 0 || yes < required
          ? 'failed'
          : 'passed'
  return { denominator, required, yes, no, abstain, vetoSeatIds, result }
}
