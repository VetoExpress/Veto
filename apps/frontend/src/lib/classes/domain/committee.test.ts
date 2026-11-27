import { describe, expect, it } from 'vitest'
import { Committee } from './committee.svelte'
import { defaultProcedureRules } from '../utils/committee/procedure-rules'

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

  it('drops legacy PCN title and body content when restoring a committee', () => {
    const committee = new Committee({
      appealWorkflow: {
        stage: 'evaluation_debate',
        currentAgendaItemId: 'item-1',
        pcnByAgendaItemId: {
          'item-1': {
            id: 'pcn-1',
            agendaItemId: 'item-1',
            fileName: 'PCN draft',
            status: 'draft',
            versions: [
              {
                version: 1,
                title: 'PCN draft',
                content: 'Legacy PCN body',
                createdAt: 1
              }
            ],
            createdAt: 1,
            updatedAt: 1
          }
        }
      }
    } as any)

    expect(committee.currentAppealPcn?.versions[0]).toEqual({
      version: 1,
      createdAt: 1
    })
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
    const seatId = committee.addSeat(
      'Delegate',
      'group-1',
      undefined,
      {},
      {
        attendance: 'present',
        hasVotingRights: true,
        sortOrder: 0
      }
    )
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

describe('Agenda procedure', () => {
  function createAgendaCommittee(
    options: { seatCount?: number; referenceGroupCount?: number } = {}
  ) {
    const seatCount = options.seatCount ?? 4
    const referenceGroupCount = options.referenceGroupCount ?? 2
    const committee = new Committee({
      name: 'GA',
      phase: 'general_debate',
      agendaMode: true,
      agenda: [{ id: 'item-1', title: 'Item one', sortOrder: 0 }]
    })
    const seatIds = Array.from({ length: seatCount }, (_, sortOrder) =>
      committee.addSeat(
        `Delegate ${sortOrder}`,
        'group-1',
        undefined,
        {},
        {
          attendance: 'present',
          hasVotingRights: true,
          isReferenceGroup: sortOrder < referenceGroupCount,
          sortOrder
        }
      )
    )
    committee.confirmAppealRollCall()
    return { committee, seatIds }
  }

  function acceptAgendaAndPreparePcn(committee: Committee): void {
    expect(committee.acceptAppealAgenda()).toBe(true)
    expect(committee.setAppealPcnFileName('pcn-draft.docx')).toBe(true)
  }

  function finishDocumentReading(committee: Committee): void {
    if (!committee.appealWorkflow.reading) {
      expect(committee.startAppealReading()).toBe(true)
    }
    expect(committee.finishAppealReading()).toBe(true)
  }

  it('passes the provisional agenda without objection into Formal Meeting Status', () => {
    const { committee } = createAgendaCommittee()

    expect(committee.acceptAppealAgenda()).toBe(true)

    expect(committee.appealWorkflow.stage).toBe('evaluation_debate')
    expect(committee.appealWorkflow.meetingStatus).toBe('formal')
    expect(committee.currentAppealPcn).not.toBeNull()
  })

  it('keeps the chair override until the next agenda item starts', () => {
    const { committee } = createAgendaCommittee()
    committee.addAgendaItem('Item two')
    acceptAgendaAndPreparePcn(committee)

    expect(committee.enableAppealChair()).toBe(true)
    expect(committee.appealWorkflow.chairOverrideEnabled).toBe(true)

    committee.appealWorkflow = {
      ...committee.appealWorkflow,
      stage: 'item_complete',
      completedAgendaItemIds: ['item-1']
    }

    expect(committee.moveToNextAppealAgendaItem()).not.toBeNull()
    expect(committee.appealWorkflow.chairOverrideEnabled).toBe(false)
  })

  it('uses a Reference Group two-thirds vote when an agenda objection is raised', () => {
    const { committee } = createAgendaCommittee()
    const sessionId = committee.startAppealAgendaObjectionVote()
    const session = committee.votingSessions.find((entry) => entry.id === sessionId)

    expect(session?.rulesSnapshot?.electorate).toBe('reference_group')
    expect(session?.rulesSnapshot?.seats).toHaveLength(2)

    for (const seat of session!.rulesSnapshot!.seats) {
      committee.castVote(sessionId, seat.id, 'yes')
    }
    committee.closeVotingSession(sessionId)

    expect(committee.appealWorkflow.stage).toBe('agenda')
    expect(committee.appealWorkflow.meetingStatus).toBe('informal')
    expect(committee.acceptAppealAgenda()).toBe(false)
    expect(committee.updateAgendaItemTitle('item-1', 'Revised item one')).toBe(true)
    expect(committee.acceptAppealAgenda()).toBe(true)
    expect(committee.appealWorkflow.meetingStatus).toBe('formal')
  })

  it('normalizes legacy informal agendas as requiring a revision before acceptance', () => {
    const committee = new Committee({
      name: 'GA',
      phase: 'general_debate',
      agendaMode: true,
      agenda: [{ id: 'item-1', title: 'Item one', sortOrder: 0 }],
      appealWorkflow: {
        stage: 'agenda',
        meetingStatus: 'informal',
        currentAgendaItemId: null,
        completedAgendaItemIds: [],
        pcnByAgendaItemId: {},
        reading: null,
        consensusReading: null,
        negotiation: null,
        consensusMeetingsByAgendaItemId: {},
        activeConsensusMeeting: null,
        events: []
      } as any
    })

    expect(committee.appealWorkflow.agendaRevisionRequired).toBe(true)
    expect(committee.acceptAppealAgenda()).toBe(false)
    expect(committee.updateAgendaItemTitle('item-1', 'Revised legacy item')).toBe(true)
    expect(committee.appealWorkflow.agendaRevisionRequired).toBe(false)
    expect(committee.acceptAppealAgenda()).toBe(true)
  })

  it('keeps the agenda objection at two-thirds even when procedure rules use simple majority', () => {
    const { committee } = createAgendaCommittee({ seatCount: 5, referenceGroupCount: 5 })
    const rules = defaultProcedureRules()
    rules.proceduralVote.threshold = { type: 'simple_majority' }
    expect(committee.setProcedureRules(rules)).toBe(true)

    const sessionId = committee.startAppealAgendaObjectionVote()
    const snapshot = committee.votingSessions.find(
      (entry) => entry.id === sessionId
    )!.rulesSnapshot!

    expect(snapshot.threshold).toEqual({ type: 'two_thirds' })
    for (const seat of snapshot.seats.slice(0, 3)) {
      committee.castVote(sessionId, seat.id, 'yes')
    }
    for (const seat of snapshot.seats.slice(3)) {
      committee.castVote(sessionId, seat.id, 'no')
    }
    committee.closeVotingSession(sessionId)

    expect(committee.appealWorkflow.stage).toBe('evaluation_debate')
    expect(committee.appealWorkflow.meetingStatus).toBe('formal')
  })

  it('keeps the agenda in Formal Meeting Status when the objection fails', () => {
    const { committee } = createAgendaCommittee()
    const sessionId = committee.startAppealAgendaObjectionVote()
    const seats = committee.votingSessions.find((entry) => entry.id === sessionId)!.rulesSnapshot!
      .seats

    committee.castVote(sessionId, seats[0].id, 'yes')
    committee.castVote(sessionId, seats[1].id, 'no')
    committee.closeVotingSession(sessionId)

    expect(committee.appealWorkflow.stage).toBe('evaluation_debate')
    expect(committee.appealWorkflow.meetingStatus).toBe('formal')
  })

  it('closes evaluation debate into a fresh pre-vote roll call', () => {
    const { committee, seatIds } = createAgendaCommittee()
    acceptAgendaAndPreparePcn(committee)
    const motionId = committee.proposeMotion({
      type: 'closure_debate',
      proposedBySeatId: seatIds[0]
    })

    committee.approveMotion(motionId)

    expect(committee.appealWorkflow.stage).toBe('evaluation_debate')
    expect(committee.phase).toBe('roll_call')
    expect(committee.rollCallState).toEqual({
      reason: 'before_voting',
      nextPhase: 'voting'
    })
    expect(
      committee.participantSeats.every((seat) => seat.procedure.attendance === 'absent')
    ).toBe(true)
    expect(committee.appealWorkflow.reading).toBeNull()
  })

  it('ends evaluation debate only after the enter-next-procedure motion passes', () => {
    const { committee, seatIds } = createAgendaCommittee()
    acceptAgendaAndPreparePcn(committee)
    const closureMotionId = committee.proposeMotion({
      type: 'closure_debate',
      proposedBySeatId: seatIds[0]
    })
    committee.approveMotion(closureMotionId)

    seatIds.forEach((seatId) => committee.setAttendance(seatId, 'present'))
    expect(committee.completeRollCall()).toBe(true)
    expect(committee.phase).toBe('voting')

    const enterMotionId = committee.proposeMotion({
      type: 'enter_next_procedure',
      proposedBySeatId: seatIds[0]
    })
    committee.approveMotion(enterMotionId)

    expect(committee.appealWorkflow.stage).toBe('document_reading')
    expect(committee.appealWorkflow.reading).toBeNull()
    expect(committee.startAppealReading()).toBe(true)
    expect(committee.appealWorkflow.reading?.durationSec).toBe(10 * 60)
    expect(committee.appealWorkflow.stage).not.toBe('item_complete')
  })

  it('runs independent consensus meetings with 25-minute and 3-minute limits', () => {
    const { committee, seatIds } = createAgendaCommittee()
    acceptAgendaAndPreparePcn(committee)
    expect(committee.endAppealEvaluationDebate()).toBe(true)
    expect(committee.startAppealConsensusMeeting('Too early', 'motion-0')).toBe(false)
    finishDocumentReading(committee)
    expect(committee.startAppealConsensusMeeting('Disputed funding clause', 'motion-1')).toBe(true)

    const meeting = committee.appealWorkflow.activeConsensusMeeting!
    expect(meeting.totalSec).toBe(25 * 60)
    expect(meeting.speakerTimeSec).toBe(3 * 60)

    expect(committee.grantAppealConsensusFloor(seatIds[0])).toBe(true)
    committee.tickAppealConsensusMeeting(meeting.startedAt + 3 * 60 * 1000)
    expect(committee.appealWorkflow.activeConsensusMeeting?.speakers[0].status).toBe('finished')

    committee.tickAppealConsensusMeeting(meeting.startedAt + 25 * 60 * 1000)
    expect(committee.appealWorkflow.activeConsensusMeeting?.status).toBe('awaiting_revision')
    expect(committee.appealWorkflow.stage).toBe('consensus_meeting')
    expect(committee.finalizeAppealPcn()).toBe(false)
  })

  it('routes an approved Consensus Meeting through the Chair caucus flow', () => {
    const { committee, seatIds } = createAgendaCommittee()
    acceptAgendaAndPreparePcn(committee)
    finishDocumentReading(committee)

    const motionId = committee.proposeMotion({
      type: 'consensus_meeting',
      proposedBySeatId: seatIds[0],
      issue: 'Disputed funding clause',
      totalTimeSec: 25 * 60,
      speakingTimePerPersonSec: 3 * 60
    })

    committee.approveMotion(motionId)

    expect(committee.appealWorkflow.stage).toBe('consensus_meeting')
    expect(committee.appealWorkflow.activeConsensusMeeting?.status).toBe('active')
    expect(committee.phase).toBe('caucus_setup')
    expect(committee.caucusSetup?.speakerSeatIds).toEqual([seatIds[0]])

    committee.addToCaucusSpeakersSetup(seatIds[1])
    committee.startCaucusWithSetup()

    expect(committee.activeCaucus).toMatchObject({
      motionId,
      type: 'consensus_meeting',
      totalSec: 25 * 60,
      elapsedSec: 0,
      paused: false
    })
    expect(committee.activeCaucus?.caucusSpeakers?.[0].allocatedTimeSec).toBe(3 * 60)

    expect(committee.finishAppealConsensusMeeting()).toBe(true)
    expect(committee.phase).toBe('general_debate')
    expect(committee.appealWorkflow.activeConsensusMeeting?.status).toBe('awaiting_revision')
  })

  it('blocks final PCN filing until document reading is completed', () => {
    const { committee } = createAgendaCommittee()
    acceptAgendaAndPreparePcn(committee)
    expect(committee.endAppealEvaluationDebate()).toBe(true)

    expect(committee.finalizeAppealPcn()).toBe(false)
    expect(committee.prepareAppealPcnFinalization()).toBe(false)

    finishDocumentReading(committee)

    expect(committee.prepareAppealPcnFinalization()).toBe(true)
    expect(committee.appealWorkflow.stage).toBe('pcn_finalization')
    expect(committee.finalizeAppealPcn()).toBe(true)
    expect(committee.appealWorkflow.stage).toBe('item_complete')
  })

  it('blocks legacy entry points while a consensus revision is pending', () => {
    const { committee } = createAgendaCommittee()
    acceptAgendaAndPreparePcn(committee)
    expect(committee.endAppealEvaluationDebate()).toBe(true)
    finishDocumentReading(committee)
    expect(committee.startAppealConsensusMeeting('Disputed clause', 'motion-1')).toBe(true)
    expect(committee.finishAppealConsensusMeeting()).toBe(true)

    expect(committee.startAppealReading()).toBe(false)
    expect(committee.recordAppealRevision('legacy note')).toBe(false)
    expect(committee.prepareAppealPcnFinalization()).toBe(false)
    expect(committee.finalizeAppealPcn()).toBe(false)
    committee.confirmAppealConsensus('legacy confirmation')
    committee.decideAppealNegotiation(false)

    expect(committee.appealWorkflow.stage).toBe('consensus_meeting')
    expect(committee.submitAppealRevision('revision')).toBe(true)
    expect(committee.appealWorkflow.stage).toBe('document_reading')
    expect(committee.prepareAppealPcnFinalization()).toBe(false)
    expect(committee.finalizeAppealPcn()).toBe(false)

    finishDocumentReading(committee)
    expect(committee.prepareAppealPcnFinalization()).toBe(true)
    expect(committee.finalizeAppealPcn()).toBe(true)
  })

  it('blocks legacy completed meetings that never recorded a revision', () => {
    const { committee } = createAgendaCommittee()
    acceptAgendaAndPreparePcn(committee)
    expect(committee.endAppealEvaluationDebate()).toBe(true)
    finishDocumentReading(committee)
    expect(committee.startAppealConsensusMeeting('Disputed clause', 'motion-1')).toBe(true)
    expect(committee.finishAppealConsensusMeeting()).toBe(true)
    const meeting = committee.appealWorkflow.activeConsensusMeeting!
    const now = Date.now()

    committee.appealWorkflow = {
      ...committee.appealWorkflow,
      stage: 'document_reading',
      activeConsensusMeeting: null,
      reading: { startedAt: now - 10 * 60 * 1000, durationSec: 10 * 60, completedAt: now },
      consensusMeetingsByAgendaItemId: {
        'item-1': [{ ...meeting, status: 'completed' }]
      }
    }

    expect(committee.recordAppealRevision('legacy note')).toBe(false)
    expect(committee.prepareAppealPcnFinalization()).toBe(false)
    expect(committee.finalizeAppealPcn()).toBe(false)
  })

  it('requires a revised PCN, allows postponement after two meetings, and caps the third', () => {
    const { committee } = createAgendaCommittee()
    acceptAgendaAndPreparePcn(committee)
    committee.endAppealEvaluationDebate()
    finishDocumentReading(committee)

    const runMeeting = (index: number) => {
      expect(committee.startAppealConsensusMeeting(`Issue ${index}`, `motion-${index}`)).toBe(true)
      expect(committee.finishAppealConsensusMeeting()).toBe(true)
      expect(committee.submitAppealRevision('notes')).toBe(true)
    }

    runMeeting(1)
    expect(committee.appealWorkflow.stage).toBe('document_reading')
    finishDocumentReading(committee)
    runMeeting(2)
    expect(committee.postponeAppealSession()).toBe(true)
    expect(committee.appealWorkflow.stage).toBe('postponed')
    expect(committee.resumePostponedAppealSession()).toBe(true)
    expect(committee.appealWorkflow.stage).toBe('document_reading')

    finishDocumentReading(committee)
    runMeeting(3)
    expect(committee.startAppealConsensusMeeting('Issue 4', 'motion-4')).toBe(false)
    expect(committee.postponeAppealSession()).toBe(false)
  })
})
