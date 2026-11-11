import type { ConferencePhase } from '$lib/classes/types/committee'
import { getLocalizedLabels } from '../../../../../../shared/action-types'
import { t } from '$lib/i18n'
import type { MessageKey } from '@vetoexpress/i18n'

/** Allowed phase transitions for the Chair-owned committee procedure state. */
export const VALID_TRANSITIONS: Record<ConferencePhase, ConferencePhase[]> = {
  preamble: ['roll_call'],
  roll_call: ['pending_speakers_list', 'voting', 'preamble'],
  pending_speakers_list: ['general_debate', 'suspended', 'closed'],
  general_debate: ['caucus', 'roll_call', 'voting', 'suspended', 'closed'],
  caucus: ['general_debate', 'caucus', 'roll_call', 'voting', 'suspended', 'closed'],
  voting: ['general_debate', 'caucus', 'voting', 'suspended', 'closed'],
  caucus_setup: ['caucus', 'general_debate', 'suspended', 'closed'],
  suspended: ['pending_speakers_list', 'general_debate', 'closed'],
  closed: ['pending_speakers_list']
}

/** Human-readable labels for Chair and Display procedure surfaces. */
export const PHASE_MESSAGE_KEYS: Record<ConferencePhase, MessageKey> = {
  preamble: 'domain_phase_preamble',
  roll_call: 'domain_phase_roll_call',
  pending_speakers_list: 'domain_phase_pending_speakers_list',
  general_debate: 'domain_phase_general_debate',
  caucus: 'domain_phase_caucus',
  voting: 'domain_phase_voting',
  caucus_setup: 'domain_phase_caucus_setup',
  suspended: 'domain_phase_suspended',
  closed: 'domain_phase_closed'
}
export const PHASE_LABELS = getLocalizedLabels(PHASE_MESSAGE_KEYS, t)

/** Return whether a phase transition is valid. Unknown phases are rejected. */
export function canTransition(from: ConferencePhase, to: ConferencePhase): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * Validate a phase transition without mutating a Committee.
 * Invalid transitions return an Error value so callers can choose their own UI/error handling.
 */
export function transitionPhase(
  from: ConferencePhase,
  to: ConferencePhase
): ConferencePhase | Error {
  if (!canTransition(from, to)) {
    return new Error(t('domain_invalid_phase_transition', { from, to }))
  }
  return to
}
