import { describe, expect, it } from 'vitest'
import { Committee } from './committee.svelte'

describe('Committee domain aggregate', () => {
  it('round-trips a committee through JSON', () => {
    const source = new Committee({
      id: 'c1',
      name: 'GA',
      seats: [],
      agenda: [],
      motions: [],
      points: [],
      draftResolutions: [],
      documentNames: [],
      votingSessions: [],
      minutes: [],
      dismissedResolvedMotionIds: [],
      dismissedPointIds: [],
      defaultSpeakingTimeSec: 120,
      phase: 'preamble'
    })

    expect(Committee.fromJSON(source.toJSON()).toJSON()).toEqual(source.toJSON())
  })

  it('returns copy-on-read participant seats', () => {
    const committee = new Committee()
    const seats = committee.participantSeats
    const originalLength = seats.length

    seats.pop()

    expect(committee.participantSeats).toHaveLength(originalLength)
  })

  it('returns copy-on-read speaker collections', () => {
    const committee = new Committee()
    const seatId = committee.addSeat('Delegate', 'group-1')
    const seat = committee.getSeat(seatId)
    expect(seat).toBeDefined()
    committee.speakerList.add(seat!)

    const waiting = committee.waitingSpeakers
    waiting.pop()
    const serialized = committee.speakerLists
    serialized.entries.pop()

    expect(committee.waitingSpeakers).toHaveLength(1)
    expect(committee.speakerLists.entries).toHaveLength(1)
  })

  it('reconciles authoritative seats while preserving local attendance', () => {
    const committee = new Committee({
      seats: [
        {
          id: 'kept',
          name: 'Old name',
          seatGroupId: 'group-1',
          capabilityOverrides: {},
          procedure: { attendance: 'present', hasVotingRights: true, sortOrder: 0 }
        },
        {
          id: 'removed',
          name: 'Removed',
          seatGroupId: 'group-1',
          capabilityOverrides: {},
          procedure: { attendance: 'absent', hasVotingRights: true, sortOrder: 1 }
        }
      ]
    })

    committee.reconcileSeats([
      {
        id: 'kept',
        name: 'Updated name',
        seatGroupId: 'group-1',
        capabilityOverrides: {},
        procedure: { attendance: 'absent', hasVotingRights: false, sortOrder: 1 }
      },
      {
        id: 'added',
        name: 'Added',
        seatGroupId: 'group-1',
        capabilityOverrides: {},
        procedure: { attendance: 'absent', hasVotingRights: true, sortOrder: 0 }
      }
    ])

    expect(committee.participantSeats).toEqual([
      expect.objectContaining({
        id: 'kept',
        name: 'Updated name',
        procedure: { attendance: 'present', hasVotingRights: false, sortOrder: 1 }
      }),
      expect.objectContaining({
        id: 'added',
        procedure: { attendance: 'absent', hasVotingRights: true, sortOrder: 0 }
      })
    ])
  })

  it.each([
    {
      motionType: 'moderated_debate',
      caucusType: 'moderated_debate',
      topic: 'Climate security'
    },
    { motionType: 'unmoderated_debate', caucusType: 'unmoderated_debate' }
  ] as const)(
    'starts $motionType as a countdown-only debate',
    ({ motionType, caucusType, ...params }) => {
      const committee = new Committee({ phase: 'general_debate' })
      const seatId = committee.addSeat('Delegate', 'group-1')
      const motionId = committee.proposeMotion({
        type: motionType,
        proposedBySeatId: seatId,
        durationSec: 600,
        ...params
      } as any)

      committee.approveMotion(motionId)

      expect(committee.phase).toBe('caucus')
      expect(committee.activeCaucus).toMatchObject({
        motionId,
        type: caucusType,
        totalSec: 600,
        elapsedSec: 0,
        paused: false
      })
      expect(committee.activeCaucus?.caucusSpeakers).toBeUndefined()
      if ('topic' in params) {
        expect(committee.motions.at(-1)).toMatchObject({ topic: params.topic })
        expect(committee.minutes.at(-2)?.description).toContain(params.topic)
      }
    }
  )

  it('does not start a moderated caucus with an empty speaker list', () => {
    const committee = new Committee({ phase: 'general_debate' })
    const seatId = committee.addSeat('Delegate', 'group-1')
    const motionId = committee.proposeMotion({
      type: 'moderated_caucus',
      proposedBySeatId: seatId,
      totalTimeSec: 600,
      speakingTimePerPersonSec: 60,
      topic: 'Climate security'
    } as any)

    committee.approveMotion(motionId)
    committee.removeFromCaucusSpeakersSetup(seatId)
    committee.startCaucusWithSetup()

    expect(committee.phase).toBe('caucus_setup')
    expect(committee.activeCaucus).toBeNull()
    expect(committee.caucusSetup?.speakerSeatIds).toEqual([])
  })

  it('clears caucus setup and active speaker state when ending a caucus', () => {
    const committee = new Committee({ phase: 'general_debate' })
    const seatId = committee.addSeat('Delegate', 'group-1')
    const motionId = committee.proposeMotion({
      type: 'moderated_caucus',
      proposedBySeatId: seatId,
      totalTimeSec: 600,
      speakingTimePerPersonSec: 60,
      topic: 'Climate security'
    } as any)

    committee.approveMotion(motionId)
    committee.startCaucusWithSetup()
    committee.startCaucusSpeakerEntry()
    committee.endCaucus()

    expect(committee.phase).toBe('general_debate')
    expect(committee.caucusSetup).toBeNull()
    expect(committee.activeCaucus).toBeNull()
    expect(committee.activeSpeaker).toBeNull()
  })

  it('uses the configured majority for substantive voting and preserves it after reload', () => {
    const committee = new Committee({ phase: 'general_debate' })
    const seatIds = Array.from({ length: 5 }, (_, sortOrder) =>
      committee.addSeat(
        `Delegate ${sortOrder}`,
        'group-1',
        undefined,
        {},
        {
          attendance: 'present',
          hasVotingRights: true,
          sortOrder
        }
      )
    )

    const legacyData = committee.toJSON()
    delete legacyData.substantiveVotingMajority
    expect(Committee.fromJSON(legacyData).substantiveVotingMajority).toBe('two_thirds')
    committee.substantiveVotingMajority = 'simple_majority'
    const restored = Committee.fromJSON(committee.toJSON())
    expect(restored.substantiveVotingMajority).toBe('simple_majority')

    const motionId = restored.proposeMotion({
      type: 'substantive_vote',
      proposedBySeatId: seatIds[0],
      documentName: 'Draft 1.1'
    } as any)
    restored.phase = 'voting'
    restored.approveMotion(motionId)

    const session = restored.votingSessions.at(-1)!
    expect(session.majorityRule).toBe('simple_majority')
    for (const [index, seatId] of seatIds.entries()) {
      restored.castVote(session.id, seatId, index < 3 ? 'yes' : 'no')
    }
    restored.closeVotingSession(session.id)
    expect(restored.votingSessions.at(-1)?.result).toBe('passed')
  })

  it('keeps a substantive vote pending outside the voting phase', () => {
    const committee = new Committee({ phase: 'general_debate' })
    const seatId = committee.addSeat('Delegate', 'group-1', undefined, {}, {
      attendance: 'present',
      hasVotingRights: true,
      sortOrder: 0
    })
    const motionId = committee.proposeMotion({
      type: 'substantive_vote',
      proposedBySeatId: seatId,
      documentName: 'Draft 1.1'
    } as any)

    committee.approveMotion(motionId)

    expect(committee.motions.at(-1)?.status).toBe('pending')
    expect(committee.votingSessions).toHaveLength(0)
  })

  it('resets a closed meeting to the motion-ready phase when resumed', () => {
    const committee = new Committee({ phase: 'general_debate' })

    committee.closeMeeting()
    expect(committee.phase).toBe('closed')

    committee.resumeMeeting()

    expect(committee.phase).toBe('roll_call')
    expect(committee.rollCallState).toEqual({
      reason: 'manual_restart',
      nextPhase: 'pending_speakers_list'
    })
    expect(committee.minutes.at(-2)?.actionType).toBe('meeting_resumed')
    expect(committee.minutes.at(-1)?.description).toBe('进入阶段: 点名')
  })

  it('starts a fresh roll call before voting when debate is closed', () => {
    const committee = new Committee({ phase: 'general_debate' })
    const seatIds = Array.from({ length: 3 }, (_, sortOrder) =>
      committee.addSeat(
        `Delegate ${sortOrder}`,
        'group-1',
        undefined,
        {},
        {
          attendance: 'present',
          hasVotingRights: true,
          sortOrder
        }
      )
    )
    const motionId = committee.proposeMotion({
      type: 'closure_debate',
      proposedBySeatId: seatIds[0]
    })

    committee.approveMotion(motionId)

    expect(committee.phase).toBe('roll_call')
    expect(committee.rollCallState).toEqual({ reason: 'before_voting', nextPhase: 'voting' })
    expect(committee.participantSeats.every((seat) => seat.procedure.attendance === 'absent')).toBe(
      true
    )

    seatIds.forEach((seatId) => committee.setAttendance(seatId, 'present'))
    expect(committee.completeRollCall()).toBe(true)
    expect(committee.phase).toBe('voting')
  })
})
