import type { MajorityRule, MotionType } from '$lib/classes/types/committee'

export interface MotionResolution {
  requiresVoting: boolean
  votingMajority: MajorityRule
  autoApprove: boolean
}

/** Resolve whether a motion requires a vote and which majority rule applies. */
export function resolveMotion(motionType: MotionType): MotionResolution {
  switch (motionType) {
    case 'change_attendance':
    case 'individual_speech':
      return { requiresVoting: false, votingMajority: 'simple_majority', autoApprove: false }
    case 'open_speakers_list':
    case 'moderated_caucus':
    case 'unmoderated_caucus':
    case 'moderated_debate':
    case 'unmoderated_debate':
    case 'modify_speaking_time':
    case 'resume_resolution':
    case 'reorder_resolution':
    case 'suspend_meeting':
    case 'substantive_vote':
    case 'consensus_meeting':
      return { requiresVoting: true, votingMajority: 'simple_majority', autoApprove: false }
    case 'closure_debate':
    case 'close_meeting':
    case 'postpone_resolution':
    case 'postpone_consensus_meeting':
    case 'enter_next_procedure':
      return { requiresVoting: true, votingMajority: 'two_thirds', autoApprove: false }
    default:
      return { requiresVoting: true, votingMajority: 'simple_majority', autoApprove: false }
  }
}
