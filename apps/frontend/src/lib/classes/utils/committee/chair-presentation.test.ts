import { describe, expect, it } from 'vitest'
import type { Committee } from '$lib/classes/types/committee'
import { getChairPresentation, getChairRosterEntries } from './chair-presentation'

function committeeState(
  overrides: Partial<
    Pick<Committee, 'phase' | 'activeSpeaker' | 'activeCaucus' | 'rollCallState'>
  > = {}
): Pick<Committee, 'phase' | 'activeSpeaker' | 'activeCaucus' | 'rollCallState'> {
  return {
    phase: 'general_debate',
    activeSpeaker: null,
    activeCaucus: null,
    rollCallState: undefined,
    ...overrides
  }
}

describe('chair presentation', () => {
  it('builds sidebar attendance from local procedure state', () => {
    const roster = getChairRosterEntries([
      {
        id: 'present-voter',
        name: 'France',
        shortName: 'FR',
        seatGroupId: 'group-1',
        capabilityOverrides: {},
        userId: 'claimed-user',
        procedure: { attendance: 'present', hasVotingRights: true, sortOrder: 0 }
      },
      {
        id: 'absent-claimed',
        name: 'Germany',
        seatGroupId: 'group-1',
        capabilityOverrides: {},
        userId: 'another-claimed-user',
        procedure: { attendance: 'absent', hasVotingRights: true, sortOrder: 1 }
      },
      {
        id: 'present-observer',
        name: 'Observer',
        seatGroupId: 'group-1',
        capabilityOverrides: {},
        procedure: { attendance: 'present', hasVotingRights: false, sortOrder: 2 }
      }
    ])

    expect(roster).toEqual([
      {
        id: 'present-voter',
        name: 'FR',
        isPresent: true,
        isVoter: true,
        isObserver: false
      },
      {
        id: 'absent-claimed',
        name: 'Germany',
        isPresent: false,
        isVoter: false,
        isObserver: false
      },
      {
        id: 'present-observer',
        name: 'Observer',
        isPresent: true,
        isVoter: false,
        isObserver: true
      }
    ])
  })

  it('maps general debate to its screen and enables chair actions', () => {
    const presentation = getChairPresentation(committeeState())

    expect(presentation.screen).toEqual({ kind: 'general_debate' })
    expect(presentation.canProposeMotion).toBe(true)
    expect(presentation.canProposePoint).toBe(true)
  })

  it('maps every caucus type explicitly', () => {
    const base = { motionId: 'motion-1', totalSec: 60, elapsedSec: 0, paused: false }

    expect(
      getChairPresentation(
        committeeState({ phase: 'caucus', activeCaucus: { ...base, type: 'moderated' } })
      ).screen
    ).toEqual({ kind: 'moderated_caucus', mode: 'moderated_caucus' })
    expect(
      getChairPresentation(
        committeeState({ phase: 'caucus', activeCaucus: { ...base, type: 'consensus_meeting' } })
      ).screen
    ).toEqual({ kind: 'moderated_caucus', mode: 'consensus_meeting' })
    expect(
      getChairPresentation(
        committeeState({ phase: 'caucus', activeCaucus: { ...base, type: 'unmoderated' } })
      ).screen
    ).toEqual({ kind: 'caucus_countdown', mode: 'unmoderated' })
    expect(
      getChairPresentation(
        committeeState({ phase: 'caucus', activeCaucus: { ...base, type: 'individual' } })
      ).screen
    ).toEqual({ kind: 'caucus_countdown', mode: 'individual' })
    expect(
      getChairPresentation(
        committeeState({ phase: 'caucus', activeCaucus: { ...base, type: 'moderated_debate' } })
      ).screen
    ).toEqual({ kind: 'caucus_countdown', mode: 'moderated_debate' })
    expect(
      getChairPresentation(
        committeeState({ phase: 'caucus', activeCaucus: { ...base, type: 'unmoderated_debate' } })
      ).screen
    ).toEqual({ kind: 'caucus_countdown', mode: 'unmoderated_debate' })
  })

  it('surfaces an invalid caucus state instead of treating it as a free caucus', () => {
    const presentation = getChairPresentation(
      committeeState({ phase: 'caucus', activeCaucus: null })
    )

    expect(presentation.screen.kind).toBe('invalid')
  })

  it('disables motions while a speaker or caucus is active', () => {
    const speaking = getChairPresentation(
      committeeState({
        activeSpeaker: { entryId: 'speaker-1', totalSec: 60, elapsedSec: 0, paused: false }
      })
    )
    const caucus = getChairPresentation(
      committeeState({
        phase: 'caucus',
        activeCaucus: {
          motionId: 'motion-1',
          type: 'unmoderated',
          totalSec: 60,
          elapsedSec: 0,
          paused: false
        }
      })
    )

    expect(speaking.canProposeMotion).toBe(false)
    expect(speaking.motionDisabledReason).toContain('发言计时')
    expect(caucus.canProposeMotion).toBe(false)
    expect(caucus.motionDisabledReason).toContain('磋商进行中')
  })

  it.each(['suspended', 'closed'] as const)('allows a %s meeting to be resumed', (phase) => {
    const presentation = getChairPresentation(committeeState({ phase }))

    expect(presentation.canResumeMeeting).toBe(true)
    expect(presentation.canProposeMotion).toBe(false)
  })
})
