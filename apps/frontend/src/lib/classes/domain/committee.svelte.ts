/**
 * committee.svelte.ts
 * ──────────────────────────────────────────────
 * Chair-owned committee aggregate: Committee + SpeakerList classes.
 *
 * 使用 Svelte 5 $state rune 实现响应式，组件可直接访问引擎属性。
 * 通过 Conference 接口序列化和反序列化纯 JSON。
 */

import type {
  Committee as CommitteeDTO,
  ConferencePhase,
  AgendaItem,
  SpeakerEntry,
  SpeakerListData,
  YieldChoice,
  YieldType,
  YieldPendingState,
  Motion,
  MotionProposal,
  DraftResolution,
  VotingSession,
  VoteBallot,
  ConferenceEntry,
  ConferenceActionType,
  Point,
  PointType,
  CaucusType,
  ProposerPosition,
  MajorityRule,
  VoteTargetType
} from '$lib/classes/types/committee'
import {
  isParticipantSeat,
  type ParticipantSeat,
  type Seat,
  type Capability
} from '$lib/classes/types/delegate'
import type { Attendance } from '$lib/classes/types/committee'
import { translate, type MessageKey } from '$lib/i18n'
import { t } from '$lib/i18n'
import type { EntryMessageValues } from '../../../../../shared/action-types'
import { getDisplayBridge, buildDisplayData } from '$lib/classes/clients/conference-display-client'
import { emitServiceEvent } from '$lib/classes/services/event-bus-bridge'
import { Timer } from '$lib/classes/services/timer/timer'
import {
  calculateMajorityThresholds,
  tallyVotes as tallyVotesEngine
} from '$lib/classes/utils/committee/voting'
import type { ProcedureRulesConfig, QuorumRecord } from '$lib/classes/types/procedure-rules'
import {
  defaultProcedureRules,
  cloneProcedureRules,
  validProcedureRulesShape,
  validateProcedureRules,
  calculateQuorum,
  createVotingSnapshot,
  cloneVotingSnapshot,
  evaluateVote
} from '$lib/classes/utils/committee/procedure-rules'
import { canTransition } from '$lib/classes/utils/committee/phase'
import { calcMaxSpeakers } from '$lib/classes/utils/committee/caucus'

// ---- 工具函数 ----------------------------------------------------------

function generateId(): string {
  return crypto.randomUUID()
}

type EntryMessage = { messageKey: MessageKey; messageValues: EntryMessageValues }

function message(messageKey: MessageKey, messageValues: EntryMessageValues = {}): EntryMessage {
  return { messageKey, messageValues }
}

function cloneEntry(entry: ConferenceEntry): ConferenceEntry {
  return { ...entry, ...(entry.messageValues ? { messageValues: { ...entry.messageValues } } : {}) }
}

function cloneVotingSession(session: VotingSession): VotingSession {
  return {
    ...session,
    ballots: session.ballots.map((ballot) => ({ ...ballot })),
    ...(session.rulesSnapshot ? { rulesSnapshot: cloneVotingSnapshot(session.rulesSnapshot) } : {}),
    ...(session.evaluation
      ? { evaluation: { ...session.evaluation, vetoSeatIds: [...session.evaluation.vetoSeatIds] } }
      : {})
  }
}

function cloneSpeakerEntry(entry: SpeakerEntry): SpeakerEntry {
  return {
    ...entry,
    yield: entry.yield ? { ...entry.yield } : undefined
  }
}

function cloneSeat(seat: Seat): Seat {
  return {
    ...seat,
    capabilityOverrides: { ...seat.capabilityOverrides },
    procedure: seat.procedure ? { ...seat.procedure } : undefined
  }
}

// ====================================================================
//  SpeakerList —— 发言名单
// ====================================================================

export class SpeakerList {
  id: string
  name: string
  entries: SpeakerEntry[] = $state([])

  constructor(id: string, name: string, entries?: SpeakerEntry[]) {
    this.id = id
    this.name = name
    if (entries) this.entries = entries.map(cloneSpeakerEntry)
  }

  // ── 查询 getters ──

  get current(): SpeakerEntry | null {
    const current = this.entries.find((s) => s.status === 'speaking')
    return current ? cloneSpeakerEntry(current) : null
  }

  /** 下一个发言人：当前发言人的下一位（caucus）/ 第一个 waiting（debate） */
  get next(): SpeakerEntry | null {
    const currentIdx = this.entries.findIndex((s) => s.status === 'speaking')
    if (currentIdx >= 0 && currentIdx + 1 < this.entries.length) {
      return cloneSpeakerEntry(this.entries[currentIdx + 1])
    }
    const waiting = this.entries.find((s) => s.status === 'waiting')
    return waiting ? cloneSpeakerEntry(waiting) : null
  }

  get ready(): SpeakerEntry | null {
    const ready = this.entries.find((s) => s.status === 'ready')
    return ready ? cloneSpeakerEntry(ready) : null
  }

  get waiting(): SpeakerEntry[] {
    return this.entries.filter((s) => s.status === 'waiting').map(cloneSpeakerEntry)
  }

  get isExhausted(): boolean {
    return this.entries.length > 0 && this.entries.every((s) => s.status === 'finished')
  }

  // ── 操作 ──

  /** 添加席位到发言名单，返回 entryId */
  add(seat: Seat, allocatedTimeSec?: number): string {
    const id = generateId()
    const entry: SpeakerEntry = {
      id,
      seatId: seat.id,
      allocatedTimeSec: allocatedTimeSec ?? 120,
      status: 'waiting'
    }
    this.entries = [...this.entries, entry]
    return id
  }

  remove(entryId: string): void {
    this.entries = this.entries.filter((s) => s.id !== entryId)
  }

  readySpeaker(entryId: string): void {
    this.entries = this.entries.map((s) => (s.id === entryId ? { ...s, status: 'ready' } : s))
  }

  startSpeaking(entryId: string): SpeakerEntry | null {
    let found: SpeakerEntry | null = null
    this.entries = this.entries.map((s) => {
      if (s.id === entryId) {
        found = { ...s, status: 'speaking', remainingTimeSec: undefined }
        return found
      }
      return s
    })
    return found
  }

  finishCurrent(): SpeakerEntry | null {
    const current = this.current
    if (!current) return null
    this.entries = this.entries.filter((s) => s.id !== current.id)
    return current
  }

  pauseCurrent(): void {
    // 标记当前发言人为 interrupted（状态由 Committee 管理）
  }

  /** 将当前发言人标记为 interrupted */
  interruptCurrent(): SpeakerEntry | null {
    const current = this.current
    if (!current) return null
    let interrupted: SpeakerEntry | null = null
    this.entries = this.entries.map((s) => {
      if (s.id === current.id) {
        interrupted = { ...s, status: 'interrupted' }
        return interrupted
      }
      return s
    })
    return interrupted
  }

  // ── 序列化 ──

  toJSON(): SpeakerListData {
    return {
      id: this.id,
      name: this.name,
      entries: this.entries.map(cloneSpeakerEntry)
    }
  }

  static fromJSON(json: SpeakerListData, seats: Seat[]): SpeakerList {
    const entries: SpeakerEntry[] = json.entries.map(cloneSpeakerEntry)
    return new SpeakerList(json.id, json.name, entries)
  }
}

// ====================================================================
//  Committee —— 委员会引擎
// ====================================================================

export class Committee {
  // ── 基础信息 ──
  id: string
  name: string = $state('')

  // ── 配置 ──
  defaultSpeakingTimeSec: number = $state(120)
  procedureRules: ProcedureRulesConfig = $state(defaultProcedureRules())
  quorumRecord: QuorumRecord | undefined = $state(undefined)

  get substantiveVotingMajority(): MajorityRule {
    return this.procedureRules.documentVote.ratio
  }
  set substantiveVotingMajority(value: MajorityRule) {
    this.procedureRules = {
      ...this.procedureRules,
      documentVote: { ...this.procedureRules.documentVote, ratio: value }
    }
  }

  setProcedureRules(config: ProcedureRulesConfig): boolean {
    if (!validateProcedureRules(config, this.participantSeats)) {
      console.warn('ProcedureRulesInvalid', {
        operation: 'setProcedureRules',
        committeeId: this.id,
        impact: 'configuration unchanged'
      })
      return false
    }
    this.procedureRules = cloneProcedureRules(config)
    this.addConferenceEntry('phase_changed', message('domain_rules_saved'))
    this.touch()
    return true
  }

  // ── 议题 ──
  agenda: AgendaItem[] = $state([])

  // ── 发言名单 ──
  speakerList: SpeakerList = new SpeakerList('main', '主发言名单')

  // ── 运行时状态 ──
  phase: ConferencePhase = $state('preamble')
  activeSpeaker: CommitteeDTO['activeSpeaker'] = $state(null)
  activeCaucus: CommitteeDTO['activeCaucus'] = $state(null)
  yieldPending: YieldPendingState | null = $state(null)
  caucusSetup: CommitteeDTO['caucusSetup'] = $state(null)
  postRollCallPhase: CommitteeDTO['postRollCallPhase'] = $state(undefined)
  /** 主发言名单是否曾被填充过（用于判断清空后是否需要重新动议） */
  speakersListHasBeenPopulated: boolean = $state(false)

  // ── 会议记录 ──
  motions: Motion[] = $state([])
  dismissedResolvedMotionIds: string[] = $state([])
  points: Point[] = $state([])
  dismissedPointIds: string[] = $state([])
  draftResolutions: DraftResolution[] = $state([])
  documentNames: string[] = $state([])
  votingSessions: VotingSession[] = $state([])
  minutes: ConferenceEntry[] = $state([])

  // ── 委员会席位（拥有 procedure 的席位参与议事） ──
  seats: Seat[] = $state([])

  // ── 计时器 ──
  timers: Map<string, Timer> = new Map()

  constructor(data?: Partial<CommitteeDTO>) {
    this.id = data?.id ?? generateId()
    if (data) {
      this.restoreFromConference(data)
    }
  }

  /** 从 Conference 数据还原状态 */
  private restoreFromConference(data: Partial<CommitteeDTO>): void {
    if (data.name != null) this.name = data.name
    if (data.defaultSpeakingTimeSec != null)
      this.defaultSpeakingTimeSec = data.defaultSpeakingTimeSec
    if (
      data.substantiveVotingMajority === 'simple_majority' ||
      data.substantiveVotingMajority === 'two_thirds'
    )
      this.substantiveVotingMajority = data.substantiveVotingMajority
    if (data.procedureRules !== undefined) {
      if (!validProcedureRulesShape(data.procedureRules)) {
        console.error('ProcedureRulesInvalid', {
          operation: 'restoreCommittee',
          committeeId: this.id,
          impact: 'restore rejected'
        })
        throw new Error(t('domain_rules_invalid'))
      }
      this.procedureRules = cloneProcedureRules(data.procedureRules)
    }
    if (data.quorumRecord)
      this.quorumRecord = {
        ...data.quorumRecord,
        rules: { ...data.quorumRecord.rules, threshold: { ...data.quorumRecord.rules.threshold } },
        evaluation: { ...data.quorumRecord.evaluation }
      }
    if (data.seats != null) this.seats = data.seats.map(cloneSeat)
    if (data.agenda != null) this.agenda = data.agenda.map((item) => ({ ...item }))
    if (data.phase != null) this.phase = data.phase
    if (data.motions != null)
      this.motions = (data.motions as Motion[]).map((motion) => ({ ...motion }))
    if (data.dismissedResolvedMotionIds != null)
      this.dismissedResolvedMotionIds = data.dismissedResolvedMotionIds
    if (data.points != null) this.points = data.points.map((point) => ({ ...point }))
    if (data.dismissedPointIds != null) this.dismissedPointIds = data.dismissedPointIds
    if (data.draftResolutions != null) this.draftResolutions = data.draftResolutions
    if (data.documentNames != null) this.documentNames = [...data.documentNames]
    if (data.votingSessions != null)
      this.votingSessions = data.votingSessions.map((source) => {
        const session = cloneVotingSession(source)
        const hasLegacyRule =
          session.majorityRule === 'simple_majority' || session.majorityRule === 'two_thirds'
        const hasLegacyTarget =
          session.targetType === 'motion' || session.targetType === 'resolution'
        if (!session.endedAt && !session.rulesSnapshot && hasLegacyRule && hasLegacyTarget) {
          const motion = this.motions.find((item) => item.id === session.targetId)
          const kind =
            session.targetType === 'resolution' || motion?.type === 'substantive_vote'
              ? 'document'
              : 'procedural'
          const legacy = defaultProcedureRules(session.majorityRule)
          legacy.proceduralVote.threshold = { type: session.majorityRule }
          session.rulesSnapshot = createVotingSnapshot(legacy, this.participantSeats, kind)
          console.warn('LegacyVoteSnapshotRecovered', {
            operation: 'restoreCommittee',
            committeeId: this.id,
            sessionId: session.id,
            impact: 'saved majority and saved roster frozen; historical electorate unavailable'
          })
        }
        return session
      })
    if (data.minutes != null) this.minutes = data.minutes.map(cloneEntry)

    // 还原 speakerList
    if (data.speakerLists) {
      this.speakerList = SpeakerList.fromJSON(data.speakerLists, this.seats)
    }

    if (data.activeCaucus?.caucusSpeakers) {
      this.activeCaucus = {
        ...data.activeCaucus,
        caucusSpeakers: data.activeCaucus.caucusSpeakers
      }
    } else if (data.activeCaucus != null) {
      this.activeCaucus = data.activeCaucus as CommitteeDTO['activeCaucus']
    }

    // 其他运行时状态
    if (data.activeSpeaker != null) this.activeSpeaker = data.activeSpeaker
    if (data.yieldPending != null) this.yieldPending = data.yieldPending
    if (data.caucusSetup != null) this.caucusSetup = data.caucusSetup
    if (data.postRollCallPhase === 'pending_speakers_list' || data.postRollCallPhase === 'voting')
      this.postRollCallPhase = data.postRollCallPhase
  }

  // ================================================================
  //  发言名单快捷属性
  // ================================================================

  get currentSpeaker(): SpeakerEntry | null {
    return this.speakerList.current
  }

  get nextSpeaker(): SpeakerEntry | null {
    return this.speakerList.next
  }

  get readySpeaker(): SpeakerEntry | null {
    return this.speakerList.ready
  }

  get waitingSpeakers(): SpeakerEntry[] {
    return this.speakerList.waiting
  }

  get speakerLists(): SpeakerListData {
    return this.speakerList.toJSON()
  }

  get participantSeats(): ParticipantSeat[] {
    return this.seats.filter(isParticipantSeat).map(cloneSeat) as ParticipantSeat[]
  }

  // ================================================================
  //  点名
  // ================================================================

  setAttendance(seatId: string, attendance: Attendance): void {
    this.seats = this.seats.map((seat) =>
      seat.id === seatId && seat.procedure
        ? { ...seat, procedure: { ...seat.procedure, attendance } }
        : seat
    )
    this.touch()
  }

  completeRollCall(): boolean {
    const participants = this.participantSeats
    const evaluation = calculateQuorum(participants, this.procedureRules.quorum)
    this.quorumRecord = {
      rules: cloneProcedureRules(this.procedureRules).quorum,
      evaluation,
      checkedAt: Date.now()
    }
    if (!evaluation.met) {
      console.warn('QuorumNotMet', {
        operation: 'completeRollCall',
        committeeId: this.id,
        ...evaluation,
        impact: 'phase unchanged'
      })
      this.addConferenceEntry(
        'roll_call_completed',
        message('domain_quorum_unmet', {
          present: evaluation.present,
          required: evaluation.required,
          denominator: evaluation.denominator
        })
      )
      this.touch()
      return false
    }
    const presentCount = participants.filter(
      (seat) => seat.procedure?.attendance === 'present'
    ).length
    const votingCount = participants.filter(
      (seat) => seat.procedure?.attendance === 'present' && seat.procedure.hasVotingRights
    ).length
    const absentSeats = participants.filter((seat) => seat.procedure?.attendance !== 'present')
    const absentNames = absentSeats.map((seat) => seat.shortName ?? seat.name).join('、')

    const observerCount = presentCount - votingCount
    const nextPhase = this.postRollCallPhase ?? 'pending_speakers_list'
    this.postRollCallPhase = undefined
    this.addConferenceEntry(
      'roll_call_completed',
      message('domain_log_roll_call', {
        present: presentCount,
        total: participants.length,
        observers: observerCount,
        voters: votingCount,
        denominator: evaluation.denominator,
        required: evaluation.required,
        countedPresent: evaluation.present,
        absentCount: absentSeats.length,
        absentNames
      })
    )
    this.addConferenceEntry(
      'phase_changed',
      nextPhase === 'voting'
        ? message('domain_log_roll_call_to_voting')
        : message('domain_log_phase', { phase: nextPhase })
    )
    this.phase = nextPhase
    this.touch()
    return true
  }

  resetRollCall(): void {
    this.quorumRecord = undefined
    this.addConferenceEntry('roll_call_reset', message('domain_log_roll_call_reset'))
    this.addConferenceEntry('phase_changed', message('domain_log_phase', { phase: 'roll_call' }))
    this.phase = 'roll_call'
    this.seats = this.seats.map((seat) =>
      seat.procedure ? { ...seat, procedure: { ...seat.procedure, attendance: 'absent' } } : seat
    )
    this.touch()
  }

  // ================================================================
  //  主发言名单操作
  // ================================================================

  addToSpeakersList(seatId: string, customTimeSec?: number): string {
    const del = this.seats.find((d) => d.id === seatId)
    if (!del) return ''

    const timeSec = customTimeSec ?? this.defaultSpeakingTimeSec
    const list = this.speakerList
    const entryId = list.add(del, timeSec)

    this.speakersListHasBeenPopulated = true
    this.touch()
    return entryId
  }

  removeFromSpeakersList(entryId: string): void {
    this.speakerList.remove(entryId)
    this.touch()
  }

  readySpeakerEntry(entryId: string): void {
    this.speakerList.readySpeaker(entryId)
    const entry = this.speakerList.entries.find((s) => s.id === entryId)
    if (entry) {
      this.addConferenceEntry(
        'speaker_ready',
        message('domain_log_speaker_ready', { name: this.getSpeakerSeatName(entry) })
      )
    }
    this.touch()
  }

  startSpeakingEntry(entryId: string): void {
    const list = this.speakerList
    const entry = list.entries.find((s) => s.id === entryId)
    if (!entry) return

    const allocSec = entry.allocatedTimeSec
    list.startSpeaking(entryId)

    this.activeSpeaker = {
      entryId,
      totalSec: allocSec,
      elapsedSec: 0,
      paused: false
    }

    this.addConferenceEntry(
      'speaker_started',
      message('domain_log_speaker_started', {
        name: this.getSpeakerSeatName(entry),
        seconds: allocSec
      })
    )
    this.touch()
  }

  pauseSpeaking(): void {
    if (!this.activeSpeaker) return
    this.activeSpeaker = { ...this.activeSpeaker, paused: true }
    this.touch()
  }

  resumeSpeaking(_remainingSec?: number): void {
    if (!this.activeSpeaker) return
    this.activeSpeaker = { ...this.activeSpeaker, paused: false }
    this.yieldPending = null
    this.touch()
  }

  endSpeaking(yieldChoice?: YieldChoice): void {
    const speaker = this.activeSpeaker
    if (!speaker) return

    const list = this.speakerList
    const entry = list.entries.find((s) => s.id === speaker.entryId)
    const elapsed = speaker.elapsedSec
    const remaining = Math.max(0, speaker.totalSec - elapsed)

    list.finishCurrent()
    this.activeSpeaker = null
    this.yieldPending = null

    // 主发言名单曾被填充且现已清空 → 回到等待动议状态
    if (
      this.phase === 'general_debate' &&
      this.speakersListHasBeenPopulated &&
      this.speakerList.entries.length === 0
    ) {
      this.phase = 'pending_speakers_list'
      this.addConferenceEntry('phase_changed', message('domain_log_speakers_empty'))
    }

    const speakerName = entry ? this.getSpeakerSeatName(entry) : speaker.entryId
    if (yieldChoice) {
      this.addConferenceEntry(
        'yield',
        message('domain_log_finished_yield', {
          name: speakerName,
          type: yieldChoice.type,
          seconds: Math.round(remaining)
        }),
        { seatId: entry?.seatId }
      )
    } else {
      this.addConferenceEntry(
        'speaker_finished',
        message('domain_log_speaker_finished', { name: speakerName }),
        { seatId: entry?.seatId }
      )
    }
    this.touch()
  }

  // ================================================================
  //  让渡
  // ================================================================

  handleYield(yieldChoice: YieldChoice): void {
    const speaker = this.activeSpeaker
    if (!speaker) return

    const list = this.speakerList
    const entry = list.entries.find((s) => s.id === speaker.entryId)
    if (!entry) return

    const elapsed = speaker.elapsedSec
    const remaining = Math.max(0, speaker.totalSec - elapsed)
    // 记录让渡选择到 speaker entry
    list.entries = list.entries.map((s) => (s.id === entry.id ? { ...s, yield: yieldChoice } : s))

    this.addConferenceEntry(
      'yield',
      message('domain_log_yield', {
        name: this.getSpeakerSeatName(entry),
        type: yieldChoice.type,
        seconds: Math.round(remaining)
      }),
      { seatId: entry.seatId }
    )

    if (yieldChoice.type === 'chair') {
      this.resolveYieldToChair()
      return
    }

    // delegate / question / comment → 暂停计时器，设置 yieldPending
    this.activeSpeaker = speaker.paused ? speaker : { ...speaker, paused: true }
    this.yieldPending = {
      originalEntryId: entry.id,
      originalSeatId: entry.seatId,
      yieldType: yieldChoice.type as YieldType,
      remainingSec: remaining,
      allocatedSec: entry.allocatedTimeSec
    }
    this.touch()
  }

  resolveYieldToChair(): void {
    const yp = this.yieldPending
    const entryId = yp?.originalEntryId ?? this.activeSpeaker?.entryId

    if (entryId) {
      this.speakerList.remove(entryId)
    }
    this.activeSpeaker = null
    this.yieldPending = null

    if (yp) {
      const originalSeat = this.getSeat(yp.originalSeatId)
      this.addConferenceEntry(
        'speaker_finished',
        message('domain_log_yield_chair', { name: originalSeat?.name ?? yp.originalSeatId }),
        { seatId: yp.originalSeatId }
      )
    }
    this.touch()
  }

  resolveYieldToDelegate(targetSeatId: string): void {
    const yp = this.yieldPending
    if (!yp || yp.yieldType !== 'delegate') return

    const targetDel = this.seats.find((d) => d.id === targetSeatId)
    if (!targetDel) return

    const list = this.speakerList
    const newEntry: SpeakerEntry = {
      id: generateId(),
      seatId: targetSeatId,
      allocatedTimeSec: Math.round(yp.remainingSec),
      status: 'ready',
      canYield: false
    }

    list.entries = [newEntry, ...list.entries.filter((s) => s.id !== yp.originalEntryId)]
    this.activeSpeaker = null
    this.yieldPending = null

    const originalSeat = this.getSeat(yp.originalSeatId)
    this.addConferenceEntry(
      'speaker_finished',
      message('domain_log_yield_delegate', {
        name: originalSeat?.name ?? yp.originalSeatId,
        target: targetDel.name,
        seconds: Math.round(yp.remainingSec)
      }),
      { seatId: yp.originalSeatId }
    )
    this.touch()
  }

  resolveYieldToQuestion(questionerSeatId: string): void {
    const yp = this.yieldPending
    if (!yp || yp.yieldType !== 'question') return

    const questionerDel = this.seats.find((d) => d.id === questionerSeatId)
    if (!questionerDel) return

    const list = this.speakerList
    this.activeSpeaker = this.activeSpeaker ? { ...this.activeSpeaker, paused: true } : null
    list.entries = list.entries.map((s) =>
      s.id === yp.originalEntryId ? { ...s, canYield: false } : s
    )
    this.yieldPending = {
      ...yp,
      questionerSeatId: questionerDel.id
    }

    const originalSeat = this.getSeat(yp.originalSeatId)
    this.addConferenceEntry(
      'yield',
      message('domain_log_yield_question', {
        name: originalSeat?.name ?? yp.originalSeatId,
        target: questionerDel.name,
        seconds: Math.round(yp.remainingSec)
      }),
      { seatId: questionerDel.id }
    )
    this.touch()
  }

  resolveYieldToComment(commenterSeatId: string): void {
    const yp = this.yieldPending
    if (!yp || yp.yieldType !== 'comment') return

    const commenterDel = this.seats.find((d) => d.id === commenterSeatId)
    if (!commenterDel) return

    const list = this.speakerList
    const newEntry: SpeakerEntry = {
      id: generateId(),
      seatId: commenterSeatId,
      allocatedTimeSec: Math.round(yp.remainingSec),
      status: 'ready',
      canYield: false
    }

    list.entries = [newEntry, ...list.entries.filter((s) => s.id !== yp.originalEntryId)]
    this.activeSpeaker = null
    this.yieldPending = null

    const originalSeat = this.getSeat(yp.originalSeatId)
    this.addConferenceEntry(
      'yield',
      message('domain_log_yield_comment', {
        name: originalSeat?.name ?? yp.originalSeatId,
        target: commenterDel.name,
        seconds: Math.round(yp.remainingSec)
      }),
      { seatId: commenterDel.id }
    )
    this.touch()
  }

  cancelYieldPending(): void {
    this.yieldPending = null
    this.touch()
  }

  // ================================================================
  //  动议
  // ================================================================

  proposeMotion(motionData: MotionProposal): string {
    const id = generateId()
    const now = Date.now()
    const motion = { ...motionData, id, proposedAt: now, status: 'pending' } as Motion

    this.motions = [...this.motions, motion]

    const proposer = this.getSeat(motion.proposedBySeatId)
    this.addConferenceEntry(
      'motion_proposed',
      this.motionMessage(motion, 'proposed', proposer?.name ?? motion.proposedBySeatId),
      {
        seatId: motion.proposedBySeatId,
        motionId: id
      }
    )
    this.touch()
    return id
  }

  approveMotion(motionId: string): void {
    const motion = this.motions.find((m) => m.id === motionId)
    if (!motion) return

    this.motions = this.motions.map((m) =>
      m.id === motionId ? { ...m, status: 'approved' as const } : m
    )
    this.addConferenceEntry('motion_approved', this.motionMessage(motion, 'approved'), { motionId })
    this.executeMotionAction(motion)
    this.touch()
  }

  rejectMotion(motionId: string): void {
    const motion = this.motions.find((m) => m.id === motionId)

    this.motions = this.motions.map((m) =>
      m.id === motionId ? { ...m, status: 'rejected' as const } : m
    )
    this.addConferenceEntry(
      'motion_rejected',
      motion
        ? this.motionMessage(motion, 'rejected')
        : message('domain_log_motion', {
            outcome: 'rejected',
            name: '',
            type: motionId,
            topic: ''
          }),
      { motionId }
    )
    this.touch()
  }

  dismissLastResolvedMotion(): void {
    const resolved = this.motions
      .filter((m) => m.status === 'approved' || m.status === 'rejected')
      .filter((m) => !this.dismissedResolvedMotionIds.includes(m.id))
    const last = resolved.length > 0 ? resolved[resolved.length - 1] : null
    if (!last) return
    this.dismissedResolvedMotionIds = [...this.dismissedResolvedMotionIds, last.id]
    this.touch()
  }

  private executeMotionAction(motion: Motion): void {
    switch (motion.type) {
      case 'open_speakers_list':
        this.executeOpenSpeakersList()
        break
      case 'moderated_caucus':
        this.executeModeratedCaucusMotion(motion)
        break
      case 'unmoderated_caucus':
      case 'moderated_debate':
      case 'unmoderated_debate':
        this.startCaucusImpl(motion.id)
        break
      case 'suspend_meeting':
        this.suspendMeeting()
        break
      case 'close_meeting':
        this.closeMeeting()
        break
      case 'modify_speaking_time':
        this.executeModifySpeakingTime(motion)
        break
      case 'closure_debate':
        this.executeClosureDebate()
        break
      case 'substantive_vote':
        this.executeSubstantiveVote(motion)
        break
      case 'change_attendance':
        this.executeChangeAttendance(motion)
        break
      case 'individual_speech':
        this.startCaucusImpl(motion.id)
        break
    }
  }

  private executeOpenSpeakersList(): void {
    const now = Date.now()
    this.votingSessions = this.votingSessions.map((s) => (!s.endedAt ? { ...s, endedAt: now } : s))
    this.phase = 'general_debate'
    this.speakersListHasBeenPopulated = false
    this.addConferenceEntry('phase_changed', message('domain_log_speakers_open'))
    this.touch()
  }

  private executeModeratedCaucusMotion(motion: Motion): void {
    if (this.activeSpeaker && !this.speakerList.current?.yield) {
      const entryId = this.activeSpeaker.entryId
      this.speakerList.remove(entryId)
      this.activeSpeaker = null
      this.addConferenceEntry('speaker_finished', message('domain_log_speaker_discarded'))
    }
    const proposerDelId = motion.proposedBySeatId
    this.phase = 'caucus_setup'
    this.caucusSetup = {
      motionId: motion.id,
      proposerPosition: 'first',
      speakerSeatIds: proposerDelId ? [proposerDelId] : []
    }
    const topic = (motion as any).topic
    this.addConferenceEntry(
      'phase_changed',
      message('domain_log_caucus_setup', { topic: topic || '', hasTopic: topic ? 'yes' : 'no' })
    )
    this.touch()
  }

  private executeModifySpeakingTime(motion: Motion): void {
    const newTime = (motion as any).newTimeSec as number
    this.defaultSpeakingTimeSec = newTime
    const list = this.speakerList
    list.entries = list.entries.map((s) =>
      s.status === 'waiting' || s.status === 'ready' ? { ...s, allocatedTimeSec: newTime } : s
    )
    this.addConferenceEntry(
      'phase_changed',
      message('domain_log_speaking_time', { seconds: newTime })
    )
    this.touch()
  }

  private executeClosureDebate(): void {
    if (this.activeSpeaker) {
      this.activeSpeaker = null
    }
    if (this.activeCaucus) {
      this.activeCaucus = null
      this.addConferenceEntry('caucus_ended', message('domain_log_debate_ended'))
    }
    this.phase = 'roll_call'
    this.postRollCallPhase = 'voting'
    this.addConferenceEntry('phase_changed', message('domain_log_before_vote'))
    this.touch()
  }

  private executeSubstantiveVote(motion: Motion): void {
    const docName = (motion as any).documentName as string
    if (docName) {
      this.addDocumentName(docName)
    }
    const majorityRule = this.substantiveVotingMajority
    this.startVotingSession(
      'motion',
      motion.id,
      majorityRule,
      message('domain_log_substantive_vote', {
        documentName: docName || '',
        hasDocumentName: docName ? 'yes' : 'no',
        majority: majorityRule
      })
    )
  }

  /** 更改席位出席状态（统一入口：动议 & 直接管理均通过此方法） */
  changeSeatAttendance(
    seatId: string,
    newAttendance: Attendance,
    opts?: { silent?: boolean }
  ): void {
    this.setAttendance(seatId, newAttendance)
    const del = this.seats.find((d) => d.id === seatId)
    if (!opts?.silent) {
      this.addConferenceEntry(
        'attendance_changed',
        message('domain_log_attendance', { name: del?.name ?? seatId, attendance: newAttendance }),
        { seatId }
      )
    }
    this.touch()
    // 推送出席变更通知到 Display
    getDisplayBridge().sendUpdate(
      buildDisplayData(this, {
        attendanceChange: del
      })
    )
  }

  private executeChangeAttendance(motion: Motion): void {
    if (motion.type !== 'change_attendance') return
    this.changeSeatAttendance(motion.proposedBySeatId, motion.newAttendance)
  }

  // ================================================================
  //  问题
  // ================================================================

  raisePoint(type: PointType, seatId: string): string {
    const id = generateId()
    const now = Date.now()
    const point: Point = { id, type, proposedBySeatId: seatId, proposedAt: now }

    this.points = [...this.points, point]

    // 程序性问题：若有活跃发言人且未暂停，则自动暂停计时器
    if (type === 'point_of_order' && this.activeSpeaker && !this.activeSpeaker.paused) {
      this.pauseSpeaking()
    }

    const del = this.seats.find((d) => d.id === seatId)
    this.addConferenceEntry(
      'point_proposed',
      message('domain_log_point', { name: del?.name ?? seatId, type: point.type }),
      {
        seatId
      }
    )
    this.touch()
    return id
  }

  dismissLatestPoint(): void {
    if (this.points.length === 0) return
    const lastPoint = this.points[this.points.length - 1]
    if (this.dismissedPointIds.includes(lastPoint.id)) return
    this.dismissedPointIds = [...this.dismissedPointIds, lastPoint.id]
    this.touch()
  }

  // ================================================================
  //  磋商
  // ================================================================

  startCaucus(motionId: string): void {
    const motion = this.motions.find((m) => m.id === motionId)
    if (!motion) return
    this.startCaucusImpl(motionId)
  }

  private startCaucusImpl(motionId: string): void {
    const motion = this.motions.find((m) => m.id === motionId)
    if (!motion) return

    let totalSec = 0
    let caucusType: CaucusType = 'unmoderated'
    let topic: string | undefined

    if (motion.type === 'moderated_caucus') {
      caucusType = 'moderated'
      totalSec = (motion as any).totalTimeSec
      topic = (motion as any).topic
    } else if (motion.type === 'unmoderated_caucus') {
      caucusType = 'unmoderated'
      totalSec = (motion as any).durationSec
    } else if (motion.type === 'moderated_debate') {
      caucusType = 'moderated_debate'
      totalSec = (motion as any).durationSec
      topic = motion.topic
    } else if (motion.type === 'unmoderated_debate') {
      caucusType = 'unmoderated_debate'
      totalSec = (motion as any).durationSec
    } else if (motion.type === 'individual_speech') {
      caucusType = 'individual'
      totalSec = (motion as any).durationSec
    }

    this.phase = 'caucus'
    this.activeCaucus = { motionId, type: caucusType, totalSec, elapsedSec: 0, paused: false }

    const eventType = caucusType === 'individual' ? 'individual_speech_started' : 'caucus_started'
    this.addConferenceEntry(
      eventType,
      message('domain_log_caucus_started', {
        type: caucusType,
        topic: topic ?? '',
        hasTopic: topic ? 'yes' : 'no'
      }),
      { motionId }
    )
    this.addConferenceEntry(
      'phase_changed',
      message('domain_log_phase', {
        phase:
          caucusType === 'moderated_debate' || caucusType === 'unmoderated_debate'
            ? caucusType
            : 'caucus'
      })
    )
    this.touch()
  }

  setCaucusProposerPosition(position: ProposerPosition): void {
    if (!this.caucusSetup) return
    const motion = this.motions.find((m) => m.id === this.caucusSetup!.motionId)
    const proposerId = motion?.proposedBySeatId
    if (!proposerId) {
      this.caucusSetup = { ...this.caucusSetup, proposerPosition: position }
      return
    }

    const ids = this.caucusSetup.speakerSeatIds.filter((id) => id !== proposerId)
    const reordered = position === 'first' ? [proposerId, ...ids] : [...ids, proposerId]
    this.caucusSetup = {
      ...this.caucusSetup,
      proposerPosition: position,
      speakerSeatIds: reordered
    }
  }

  addToCaucusSpeakersSetup(seatId: string): void {
    if (!this.caucusSetup) return
    if (this.caucusSetup.speakerSeatIds.includes(seatId)) return

    const motion = this.motions.find((m) => m.id === this.caucusSetup!.motionId)
    const proposerId = motion?.proposedBySeatId

    const ids = this.caucusSetup.speakerSeatIds
    const newIds =
      this.caucusSetup.proposerPosition === 'last' && proposerId
        ? [...ids.slice(0, -1), seatId, proposerId]
        : [...ids, seatId]

    const perSpeakerSec = (motion as any)?.speakingTimePerPersonSec ?? 60
    const totalSec = this.caucusSetup.remainingSec ?? (motion as any)?.totalTimeSec ?? 0
    const maxSpeakers = Math.floor(totalSec / perSpeakerSec)
    if (newIds.length > maxSpeakers) return

    this.caucusSetup = { ...this.caucusSetup, speakerSeatIds: newIds }
  }

  removeFromCaucusSpeakersSetup(seatId: string): void {
    if (!this.caucusSetup) return
    this.caucusSetup = {
      ...this.caucusSetup,
      speakerSeatIds: this.caucusSetup.speakerSeatIds.filter((id) => id !== seatId)
    }
  }

  startCaucusWithSetup(): void {
    if (!this.caucusSetup) return

    const { motionId, speakerSeatIds, remainingSec } = this.caucusSetup
    const motion = this.motions.find((m) => m.id === motionId)
    if (!motion) return

    const perSpeakerSec = ((motion as any).speakingTimePerPersonSec as number) ?? 60
    const totalSec = remainingSec ?? ((motion as any).totalTimeSec as number)
    const topic = (motion as any).topic

    const maxSpeakers = Math.max(1, Math.floor(totalSec / perSpeakerSec))
    const trimmedIds = speakerSeatIds.slice(0, maxSpeakers)

    const caucusSpeakers: SpeakerEntry[] = trimmedIds.map((delId) => {
      const del = this.seats.find((d) => d.id === delId)
      return {
        id: generateId(),
        seatId: delId,
        allocatedTimeSec: perSpeakerSec,
        status: 'waiting' as const
      }
    })

    if (caucusSpeakers.length > 0) {
      caucusSpeakers[0] = { ...caucusSpeakers[0], status: 'ready' }
    }

    this.phase = 'caucus'
    this.caucusSetup = null
    this.activeCaucus = {
      motionId,
      type: 'moderated',
      totalSec,
      elapsedSec: 0,
      paused: false,
      caucusSpeakers,
      currentSpeakerIndex: caucusSpeakers.length > 0 ? 0 : undefined
    }
    this.activeSpeaker = null

    const firstName = caucusSpeakers[0] ? this.getSpeakerSeatName(caucusSpeakers[0]) : ''
    this.addConferenceEntry(
      'caucus_started',
      message('domain_log_caucus_first', {
        topic: topic ?? '',
        hasTopic: topic ? 'yes' : 'no',
        name: firstName
      }),
      { motionId }
    )
    this.addConferenceEntry('phase_changed', message('domain_log_phase', { phase: 'caucus' }))
    this.touch()
  }

  /**
   * 移除发言人后的统一过渡逻辑。
   * 由 advanceCaucusSpeaker / cancelCaucusSpeaker 共用。
   */
  private transitionAfterCaucusSpeakerRemoved(
    updatedSpeakers: SpeakerEntry[],
    updatedCaucus: this['activeCaucus'] & {},
    totalRemaining: number,
    perSpeakerSec: number
  ): void {
    if (updatedSpeakers.length === 0) {
      if (totalRemaining >= perSpeakerSec) {
        const previousMotionId = updatedCaucus.motionId

        this.phase = 'caucus_setup'
        this.activeCaucus = null
        this.activeSpeaker = null

        this.caucusSetup = {
          motionId: previousMotionId,
          proposerPosition: 'first',
          speakerSeatIds: [],
          remainingSec: totalRemaining
        }

        this.addConferenceEntry('caucus_paused', message('domain_log_caucus_exhausted'))
        this.addConferenceEntry(
          'phase_changed',
          message('domain_log_phase', { phase: 'caucus_setup' })
        )
      } else {
        this.endCaucus()
      }

      this.touch()
      return
    }

    if (totalRemaining >= perSpeakerSec) {
      const nextSpeaker: SpeakerEntry = {
        ...updatedSpeakers[0],
        status: 'ready'
      }

      const nextName = this.getSpeakerSeatName(nextSpeaker)

      this.activeCaucus = {
        ...updatedCaucus,
        caucusSpeakers: [nextSpeaker, ...updatedSpeakers.slice(1)],
        currentSpeakerIndex: 0
      }

      this.activeSpeaker = null

      this.addConferenceEntry(
        'speaker_ready',
        message('domain_log_speaker_ready_wait', { name: nextName })
      )
    } else {
      this.endCaucus()
    }

    this.touch()
  }

  advanceCaucusSpeaker(): void {
    const caucus = this.activeCaucus
    if (!caucus) return

    const speakers = caucus.caucusSpeakers ?? []
    const currentIdx = caucus.currentSpeakerIndex ?? -1

    // 先累计当前发言人的时间
    if (this.activeSpeaker) {
      this.activeCaucus = {
        ...caucus,
        elapsedSec: caucus.elapsedSec + this.activeSpeaker.elapsedSec
      }
    }

    const updatedCaucus = this.activeCaucus!
    const totalRemaining = updatedCaucus.totalSec - updatedCaucus.elapsedSec
    const motion = this.motions.find((m) => m.id === updatedCaucus.motionId) as any
    const perSpeakerSec = motion?.speakingTimePerPersonSec ?? 60

    // 删除当前发言人
    const updatedSpeakers =
      currentIdx >= 0 ? speakers.filter((_, i) => i !== currentIdx) : [...speakers]

    this.transitionAfterCaucusSpeakerRemoved(
      updatedSpeakers,
      updatedCaucus,
      totalRemaining,
      perSpeakerSec
    )
  }

  startCaucusSpeakerEntry(): void {
    if (!this.activeCaucus?.caucusSpeakers) return

    const speakers = this.activeCaucus.caucusSpeakers
    const readyIdx = speakers.findIndex((s) => s.status === 'ready')
    if (readyIdx < 0) return

    const readySpeaker = speakers[readyIdx]
    const perSpeakerSec = readySpeaker.allocatedTimeSec

    const updatedSpeakers = speakers.map((s, i) =>
      i === readyIdx ? { ...s, status: 'speaking' as const } : s
    )

    this.activeCaucus = {
      ...this.activeCaucus,
      caucusSpeakers: updatedSpeakers,
      currentSpeakerIndex: readyIdx
    }
    this.activeSpeaker = {
      entryId: readySpeaker.seatId,
      totalSec: perSpeakerSec,
      elapsedSec: 0,
      paused: false
    }

    const speakerName = this.getSpeakerSeatName(readySpeaker)
    this.addConferenceEntry(
      'speaker_started',
      message('domain_log_speaker_started', { name: speakerName, seconds: perSpeakerSec })
    )
    this.touch()
  }

  appendCaucusSpeaker(seatId: string): void {
    if (!this.activeCaucus?.caucusSpeakers) return

    const currentSpeakers = this.activeCaucus.caucusSpeakers
    if (currentSpeakers.some((s) => s.seatId === seatId)) return

    const del = this.seats.find((d) => d.id === seatId)
    const motion = this.motions.find((m) => m.id === this.activeCaucus!.motionId) as any
    const perSpeakerSec = motion?.speakingTimePerPersonSec ?? 60

    const totalRemaining = this.activeCaucus.totalSec - this.activeCaucus.elapsedSec
    const futureCount = currentSpeakers.length + 1
    if (futureCount * perSpeakerSec > totalRemaining) return

    const newSpeaker: SpeakerEntry = {
      id: generateId(),
      seatId,
      allocatedTimeSec: perSpeakerSec,
      status: 'waiting' as const
    }

    const hasActiveSpeaker = this.activeSpeaker != null

    if (hasActiveSpeaker) {
      this.activeCaucus = {
        ...this.activeCaucus,
        caucusSpeakers: [...currentSpeakers, newSpeaker]
      }
    } else {
      this.activeCaucus = {
        ...this.activeCaucus,
        caucusSpeakers: [...currentSpeakers, { ...newSpeaker, status: 'ready' }],
        currentSpeakerIndex: this.activeCaucus.caucusSpeakers.length
      }
      this.addConferenceEntry(
        'speaker_ready',
        message('domain_log_speaker_ready_wait', { name: del?.name ?? seatId })
      )
    }
    this.touch()
  }

  /** 取消 ready 状态的发言人（移出队列并自动推进到下一位） */
  cancelCaucusSpeaker(): void {
    const caucus = this.activeCaucus
    if (!caucus?.caucusSpeakers) return

    const speakers = caucus.caucusSpeakers
    const readyIdx = speakers.findIndex((s) => s.status === 'ready')
    if (readyIdx < 0) return

    const speaker = speakers[readyIdx]
    const updatedSpeakers = speakers.filter((_, i) => i !== readyIdx)

    const totalRemaining = caucus.totalSec - caucus.elapsedSec
    const motion = this.motions.find((m) => m.id === caucus.motionId) as any
    const perSpeakerSec = motion?.speakingTimePerPersonSec ?? 60

    this.addConferenceEntry(
      'speaker_cancelled',
      message('domain_log_speaker_cancelled', { name: this.getSpeakerSeatName(speaker) })
    )

    this.transitionAfterCaucusSpeakerRemoved(updatedSpeakers, caucus, totalRemaining, perSpeakerSec)
  }

  pauseCaucus(): void {
    if (!this.activeCaucus) return
    this.activeCaucus = { ...this.activeCaucus, paused: true }
    this.touch()
  }

  resumeCaucus(_remainingSec?: number): void {
    if (!this.activeCaucus) return
    this.activeCaucus = { ...this.activeCaucus, paused: false }
    this.touch()
  }

  endCaucus(): void {
    const caucusType = this.activeCaucus?.type
    this.phase = 'general_debate'
    this.activeCaucus = null
    const eventType = caucusType === 'individual' ? 'individual_speech_ended' : 'caucus_ended'
    this.addConferenceEntry(
      eventType,
      message('domain_log_caucus_ended', { type: caucusType ?? '' })
    )
    this.addConferenceEntry(
      'phase_changed',
      message('domain_log_phase', { phase: 'general_debate' })
    )
    this.touch()
  }

  // ================================================================
  //  投票
  // ================================================================

  startVotingSession(
    targetType: VoteTargetType,
    targetId: string,
    majorityRule: MajorityRule,
    descriptionOverride?: string | EntryMessage
  ): string {
    const motion = this.motions.find((item) => item.id === targetId)
    const kind =
      targetType === 'resolution' || motion?.type === 'substantive_vote' ? 'document' : 'procedural'
    if (
      !validateProcedureRules(this.procedureRules, this.participantSeats) ||
      !calculateQuorum(this.participantSeats, this.procedureRules.quorum).met ||
      this.votingSessions.some((session) => !session.endedAt)
    ) {
      console.warn('VoteStartRejected', {
        operation: 'startVotingSession',
        committeeId: this.id,
        targetId,
        impact: 'no vote created'
      })
      return ''
    }
    const rulesSnapshot = createVotingSnapshot(
      this.procedureRules,
      this.participantSeats,
      kind,
      motion?.type,
      majorityRule
    )
    const presentSeats = rulesSnapshot.seats.filter(
      (seat) => seat.procedure.attendance === 'present' && seat.procedure.hasVotingRights
    )
    if (!presentSeats.length) {
      console.warn('EmptyElectorate', {
        operation: 'startVotingSession',
        committeeId: this.id,
        impact: 'no vote created'
      })
      return ''
    }
    const id = generateId()
    const firstSeatId = presentSeats[0]?.id ?? null

    const session: VotingSession = {
      id,
      targetType,
      targetId,
      majorityRule:
        rulesSnapshot.threshold.type === 'fixed' ? majorityRule : rulesSnapshot.threshold.type,
      rulesSnapshot,
      ballots: [],
      startedAt: Date.now(),
      currentSeatId: firstSeatId,
      round: 1
    }

    this.phase = 'voting'
    this.votingSessions = [...this.votingSessions, session]

    const desc =
      descriptionOverride ?? message('domain_log_voting_started', { majority: majorityRule })
    this.addConferenceEntry('voting_started', desc)
    this.addConferenceEntry('phase_changed', message('domain_log_phase', { phase: 'voting' }))
    this.touch()
    return id
  }

  castVote(sessionId: string, seatId: string, vote: 'yes' | 'no' | 'abstain' | 'skip'): void {
    const sessionIdx = this.votingSessions.findIndex((s) => s.id === sessionId)
    if (sessionIdx < 0) return

    const session = this.votingSessions[sessionIdx]
    if (session.endedAt) {
      console.warn('VoteAlreadyClosed', {
        operation: 'castVote',
        committeeId: this.id,
        sessionId,
        impact: 'ballot rejected'
      })
      return
    }
    if (session.currentSeatId !== seatId) {
      console.warn(
        `castVote: seat ${seatId} is not the current voter (current=${session.currentSeatId})`
      )
      return
    }

    if (session.round >= 2 && (vote === 'abstain' || vote === 'skip')) {
      console.warn(`castVote: round ${session.round} does not allow ${vote}`)
      return
    }

    const existing = session.ballots.findIndex((b) => b.seatId === seatId)
    const newBallot: VoteBallot = { seatId, vote }
    let ballots: VoteBallot[]
    if (existing >= 0) {
      ballots = session.ballots.map((b, i) => (i === existing ? newBallot : b))
    } else {
      ballots = [...session.ballots, newBallot]
    }

    const presentSeats = (session.rulesSnapshot?.seats ?? this.participantSeats)
      .filter((seat) => seat.procedure.attendance === 'present' && seat.procedure.hasVotingRights)
      .sort((a, b) => a.procedure.sortOrder - b.procedure.sortOrder)

    const { nextSeatId, nextRound } = this.advanceVoting(
      session.round,
      seatId,
      ballots,
      presentSeats
    )

    this.votingSessions = this.votingSessions.map((s, i) =>
      i === sessionIdx ? { ...s, ballots, currentSeatId: nextSeatId, round: nextRound } : s
    )
    this.touch()
  }

  private advanceVoting(
    currentRound: number,
    justVotedSeatId: string,
    ballots: VoteBallot[],
    presentSeats: ParticipantSeat[]
  ): { nextSeatId: string | null; nextRound: number } {
    if (currentRound === 1) {
      const currentIdx = presentSeats.findIndex((d) => d.id === justVotedSeatId)
      const nextSeat = presentSeats[currentIdx + 1]
      if (nextSeat) {
        return { nextSeatId: nextSeat.id, nextRound: 1 }
      }
      const skippedIds = new Set(ballots.filter((b) => b.vote === 'skip').map((b) => b.seatId))
      if (skippedIds.size > 0) {
        const firstSkipped = presentSeats.find((d) => skippedIds.has(d.id))
        return { nextSeatId: firstSkipped?.id ?? null, nextRound: 2 }
      }
      return { nextSeatId: null, nextRound: 1 }
    }

    const skippedSeats = presentSeats.filter((d) => {
      const ballot = ballots.find((b) => b.seatId === d.id)
      return ballot?.vote === 'skip'
    })
    const currentSkippedIdx = skippedSeats.findIndex((d) => d.id === justVotedSeatId)
    const nextSkipped = skippedSeats[currentSkippedIdx + 1]
    if (nextSkipped) {
      return { nextSeatId: nextSkipped.id, nextRound: 2 }
    }
    return { nextSeatId: null, nextRound: 2 }
  }

  closeVotingSession(sessionId: string): void {
    const sessionIdx = this.votingSessions.findIndex((s) => s.id === sessionId)
    if (sessionIdx < 0) return

    const session = this.votingSessions[sessionIdx]
    if (session.endedAt) return
    if (session.currentSeatId !== null) {
      console.warn('closeVotingSession: not all seats have voted yet')
      return
    }

    const snapshot = session.rulesSnapshot
    if (!snapshot) {
      console.warn('LegacyVoteMissingSnapshot', {
        operation: 'closeVotingSession',
        committeeId: this.id,
        sessionId,
        impact: 'restart vote required'
      })
      return
    }
    const evaluation = evaluateVote(session.ballots, snapshot)
    if (evaluation.result === 'invalid' || evaluation.result === 'incomplete') {
      console.warn('VoteNotFinalizable', {
        operation: 'closeVotingSession',
        committeeId: this.id,
        sessionId,
        evaluation,
        impact: 'vote stays open'
      })
      return
    }
    const { yes, no, abstain, result } = evaluation

    const now = Date.now()

    let newMotions = this.motions
    let newPhase = this.phase
    let newPostRollCallPhase = this.postRollCallPhase
    let newActiveSpeaker = this.activeSpeaker
    let newActiveCaucus = this.activeCaucus
    let newDefaultSpeakingTimeSec = this.defaultSpeakingTimeSec
    let newSpeakersList = this.speakerList.entries

    if (session.targetType === 'motion') {
      const motion = this.motions.find((m) => m.id === session.targetId)
      if (motion) {
        if (motion.type === 'substantive_vote') {
          const docName = (motion as any).documentName as string
          newSpeakersList = []
          this.addConferenceEntry('phase_changed', message('domain_log_speakers_closed'))
        } else {
          const motionStatus: 'approved' | 'rejected' =
            result === 'passed' ? 'approved' : 'rejected'
          newMotions = this.motions.map((m) =>
            m.id === session.targetId ? { ...m, status: motionStatus } : m
          )

          if (result === 'passed') {
            if (motion.type === 'suspend_meeting') {
              newPhase = 'suspended'
              newActiveSpeaker = null
              newActiveCaucus = null
              this.addConferenceEntry('meeting_suspended', message('domain_log_suspended'))
              this.addConferenceEntry(
                'phase_changed',
                message('domain_log_phase', { phase: 'suspended' })
              )
            } else if (motion.type === 'close_meeting') {
              newPhase = 'closed'
              newActiveSpeaker = null
              newActiveCaucus = null
              this.addConferenceEntry('meeting_closed', message('domain_log_closed'))
              this.addConferenceEntry(
                'phase_changed',
                message('domain_log_phase', { phase: 'closed' })
              )
            } else if (motion.type === 'closure_debate') {
              newPhase = 'roll_call'
              newPostRollCallPhase = 'voting'
              newActiveSpeaker = null
              newActiveCaucus = null
              this.addConferenceEntry('phase_changed', message('domain_log_before_vote'))
            } else if (
              motion.type === 'unmoderated_caucus' ||
              motion.type === 'moderated_debate' ||
              motion.type === 'unmoderated_debate'
            ) {
              const durationSec = (motion as any).durationSec as number
              const caucusType: CaucusType =
                motion.type === 'moderated_debate'
                  ? 'moderated_debate'
                  : motion.type === 'unmoderated_debate'
                    ? 'unmoderated_debate'
                    : 'unmoderated'
              const topic = motion.type === 'moderated_debate' ? motion.topic : undefined
              newPhase = 'caucus'
              newActiveSpeaker = null
              newActiveCaucus = {
                motionId: motion.id,
                type: caucusType,
                totalSec: durationSec,
                elapsedSec: 0,
                paused: false
              }
              this.addConferenceEntry(
                'caucus_started',
                message('domain_log_caucus_started', {
                  type: caucusType,
                  topic: topic ?? '',
                  hasTopic: topic ? 'yes' : 'no'
                })
              )
              this.addConferenceEntry(
                'phase_changed',
                message('domain_log_phase', { phase: caucusType })
              )
            } else if (motion.type === 'modify_speaking_time') {
              const newTime = (motion as any).newTimeSec as number
              newDefaultSpeakingTimeSec = newTime
              newSpeakersList = this.speakerList.entries.map((s) =>
                s.status === 'waiting' || s.status === 'ready'
                  ? { ...s, allocatedTimeSec: newTime }
                  : s
              )
            }
          }
        }
      }
    }

    this.addConferenceEntry(
      'voting_ended',
      message('domain_log_voting_ended_with_basis', {
        yes,
        no,
        abstain,
        result,
        denominator: evaluation.denominator,
        required: evaluation.required,
        vetoNames: evaluation.vetoSeatIds
          .map((id) => snapshot.seats.find((seat) => seat.id === id)?.name ?? id)
          .join(', ')
      })
    )

    this.phase = newPhase
    this.postRollCallPhase = newPostRollCallPhase
    this.activeSpeaker = newActiveSpeaker
    this.activeCaucus = newActiveCaucus
    this.defaultSpeakingTimeSec = newDefaultSpeakingTimeSec
    this.speakerList.entries = newSpeakersList
    this.votingSessions = this.votingSessions.map((s, i) =>
      i === sessionIdx ? { ...s, endedAt: now, result, evaluation } : s
    )
    this.motions = newMotions
    this.touch()
  }

  // ================================================================
  //  决议
  // ================================================================

  addDocumentName(name: string): void {
    const trimmed = name.trim()
    if (!trimmed) return
    const filtered = this.documentNames.filter((n) => n !== trimmed)
    this.documentNames = [trimmed, ...filtered].slice(0, 20)
    this.touch()
  }

  introduceResolution(
    title: string,
    sponsors: string[],
    signatories: string[],
    content: string,
    agendaItemId?: string
  ): string {
    const id = generateId()
    const resolution: DraftResolution = {
      id,
      title,
      sponsors,
      signatories,
      content,
      agendaItemId,
      createdAt: Date.now()
    }
    this.draftResolutions = [...this.draftResolutions, resolution]
    this.addConferenceEntry('resolution_introduced', message('domain_log_resolution', { title }), {
      resolutionId: id
    })
    this.touch()
    return id
  }

  // ================================================================
  //  会议控制
  // ================================================================

  suspendMeeting(): void {
    this.phase = 'suspended'
    this.activeSpeaker = null
    this.activeCaucus = null
    this.addConferenceEntry('meeting_suspended', message('domain_log_suspended'))
    this.addConferenceEntry('phase_changed', message('domain_log_phase', { phase: 'suspended' }))
    this.touch()
  }

  resumeMeeting(): void {
    this.phase = 'pending_speakers_list'
    this.addConferenceEntry('meeting_resumed', message('domain_log_resumed'))
    this.addConferenceEntry(
      'phase_changed',
      message('domain_log_phase', { phase: 'pending_speakers_list' })
    )
    this.touch()
  }

  closeMeeting(): void {
    this.phase = 'closed'
    this.activeSpeaker = null
    this.activeCaucus = null
    this.addConferenceEntry('meeting_closed', message('domain_log_closed'))
    this.addConferenceEntry('phase_changed', message('domain_log_phase', { phase: 'closed' }))
    this.touch()
  }

  setPhase(phase: ConferencePhase): void {
    this.phase = phase
    this.touch()
  }

  // ================================================================
  //  会议记录
  // ================================================================

  /**
   * ConferenceActionType → ServiceEventType 映射。
   * 每条日志记录自动触发对应的插件服务事件，确保日志和事件通知始终同步。
   */
  private static readonly CONFERENCE_ACTION_TO_SERVICE_EVENT: Partial<
    Record<ConferenceActionType, string>
  > = {
    roll_call_completed: 'conference:roll_call_completed',
    speaker_started: 'conference:speaker_started',
    speaker_finished: 'conference:speaker_finished',
    motion_proposed: 'conference:motion_proposed',
    motion_approved: 'conference:motion_approved',
    voting_started: 'conference:voting_started',
    voting_ended: 'conference:voting_ended',
    caucus_started: 'conference:caucus_started',
    caucus_ended: 'conference:caucus_ended',
    individual_speech_started: 'conference:individual_speech_started',
    individual_speech_ended: 'conference:individual_speech_ended',
    meeting_suspended: 'conference:meeting_suspended',
    meeting_resumed: 'conference:meeting_resumed',
    meeting_closed: 'conference:meeting_closed',
    phase_changed: 'conference:phase_changed'
  }

  private motionMessage(motion: Motion, outcome: string, name = ''): EntryMessage {
    return message('domain_log_motion', {
      outcome,
      name,
      type: motion.type,
      topic:
        motion.type === 'moderated_caucus' || motion.type === 'moderated_debate' ? motion.topic : ''
    })
  }

  addConferenceEntry(
    actionType: ConferenceActionType,
    description: string | EntryMessage,
    related?: {
      seatId?: string
      motionId?: string
      resolutionId?: string
    }
  ): void {
    const entry: ConferenceEntry = {
      id: generateId(),
      timestamp: Date.now(),
      actionType,
      description:
        typeof description === 'string'
          ? description
          : translate(description.messageKey, description.messageValues, 'zh-CN'),
      ...(typeof description === 'string'
        ? {}
        : {
            messageKey: description.messageKey,
            messageValues: { ...description.messageValues }
          }),
      ...related
    }
    this.minutes = [...this.minutes, entry]

    // 自动触发对应的插件服务事件（与日志写入同一调用点，确保同步）
    const serviceEventType = Committee.CONFERENCE_ACTION_TO_SERVICE_EVENT[actionType]
    if (serviceEventType) {
      emitServiceEvent(serviceEventType, this.buildEventContext())
    }
  }

  /** 构建插件事件上下文数据 */
  private buildEventContext(): Record<string, unknown> {
    const speakerEntry = this.activeSpeaker
      ? this.speakerList.entries.find((s) => s.id === this.activeSpeaker!.entryId)
      : null
    const speakerSeat = speakerEntry ? this.seats.find((d) => d.id === speakerEntry.seatId) : null

    return {
      conferenceId: this.id,
      conferenceName: this.name,
      phase: this.phase,
      presentCount: this.getPresentCount(),
      votingCount: this.getVotingCount(),
      currentSpeaker:
        this.activeSpeaker && speakerSeat
          ? {
              seatId: speakerSeat.id,
              seatName: speakerSeat.name,
              remainingTimeSec: Math.max(
                0,
                this.activeSpeaker.totalSec - this.activeSpeaker.elapsedSec
              )
            }
          : null,
      activeCaucusType: this.activeCaucus?.type ?? null,
      activeCaucusMotionId: this.activeCaucus?.motionId ?? null
    }
  }

  // ================================================================
  //  投票统计（纯函数，代理到引擎函数）
  // ================================================================

  tallyVotes(ballots: VoteBallot[]): { yes: number; no: number; abstain: number } {
    return tallyVotesEngine(ballots)
  }

  getPresentCount(): number {
    return this.participantSeats.filter((seat) => seat.procedure.attendance === 'present').length
  }

  /** 拥有投票权的出席代表人数（排除观察员） */
  getVotingCount(): number {
    return this.participantSeats.filter(
      (seat) => seat.procedure.attendance === 'present' && seat.procedure.hasVotingRights
    ).length
  }

  getSimpleMajorityThreshold(): number {
    return Math.floor(this.getVotingCount() / 2) + 1
  }

  getTwoThirdsThreshold(): number {
    return Math.ceil((this.getVotingCount() * 2) / 3)
  }

  getMajorityThresholds() {
    return calculateMajorityThresholds(this.participantSeats)
  }

  // ================================================================
  //  序列化
  // ================================================================

  toJSON(): CommitteeDTO {
    return {
      id: this.id,
      name: this.name,
      phase: this.phase,
      agenda: this.agenda.map((item) => ({ ...item })),
      speakerLists: this.speakerList.toJSON(),
      motions: this.motions.map((motion) => ({ ...motion })),
      dismissedResolvedMotionIds: [...this.dismissedResolvedMotionIds],
      points: this.points.map((point) => ({ ...point })),
      dismissedPointIds: [...this.dismissedPointIds],
      draftResolutions: this.draftResolutions.map((resolution) => ({
        ...resolution,
        sponsors: [...resolution.sponsors],
        signatories: [...resolution.signatories]
      })),
      documentNames: [...this.documentNames],
      votingSessions: this.votingSessions.map(cloneVotingSession),
      minutes: this.minutes.map(cloneEntry),
      defaultSpeakingTimeSec: this.defaultSpeakingTimeSec,
      substantiveVotingMajority: this.substantiveVotingMajority,
      procedureRules: cloneProcedureRules(this.procedureRules),
      quorumRecord: this.quorumRecord
        ? {
            ...this.quorumRecord,
            rules: {
              ...this.quorumRecord.rules,
              threshold: { ...this.quorumRecord.rules.threshold }
            },
            evaluation: { ...this.quorumRecord.evaluation }
          }
        : undefined,
      caucusSetup: this.caucusSetup,
      postRollCallPhase: this.postRollCallPhase,
      activeCaucus: this.activeCaucus
        ? {
            ...this.activeCaucus,
            caucusSpeakers: this.activeCaucus.caucusSpeakers
          }
        : null,
      activeSpeaker: this.activeSpeaker,
      yieldPending: this.yieldPending,
      seats: this.seats.map(cloneSeat)
    }
  }

  static fromJSON(json: CommitteeDTO): Committee {
    const cleanJson = { ...json }

    // 清理已过期的计时器状态
    if (
      cleanJson.activeSpeaker &&
      cleanJson.activeSpeaker.elapsedSec >= cleanJson.activeSpeaker.totalSec
    ) {
      const expiredEntryId = cleanJson.activeSpeaker.entryId
      if (cleanJson.speakerLists?.entries) {
        cleanJson.speakerLists = {
          ...cleanJson.speakerLists,
          entries: cleanJson.speakerLists.entries.filter((s) => s.id !== expiredEntryId)
        }
      }
      cleanJson.activeSpeaker = null
    }
    if (
      cleanJson.activeCaucus &&
      cleanJson.activeCaucus.elapsedSec >= cleanJson.activeCaucus.totalSec
    ) {
      cleanJson.activeCaucus = null
    }

    return new Committee(cleanJson)
  }

  // ================================================================
  //  工具
  // ================================================================

  /**
   * 通过 seatId 查表获取席位名称。
   */
  getSpeakerSeatName(entry: { seatId: string }): string {
    return this.seats.find((d) => d.id === entry.seatId)?.name ?? entry.seatId
  }

  /** 状态已通过 store 的 syncEngine 统一写入所属大会。 */
  private touch(): void {}

  // ================================================================
  //  委员会席位管理
  // ================================================================

  addSeat(
    name: string,
    seatGroupId: string,
    role?: string,
    capabilityOverrides: Partial<Record<Capability, boolean>> = {},
    procedure?: Seat['procedure'],
    roleId?: string
  ): string {
    const id = generateId()
    const seat: Seat = {
      id,
      name,
      seatGroupId,
      capabilityOverrides,
      role,
      roleId,
      procedure
    }
    this.seats = [...this.seats, seat]
    this.addConferenceEntry('phase_changed', message('domain_log_seat_created', { name }))
    this.touch()
    return id
  }

  updateSeat(id: string, updates: Partial<Seat>): void {
    this.seats = this.seats.map((seat) => {
      if (seat.id !== id) return seat
      return { ...seat, ...updates }
    })
    this.touch()
  }

  /**
   * Reconcile the Chair's local seat layer with an authoritative Committee roster.
   * Runtime attendance survives for seats that still exist; static profile fields
   * and ordering come from the new roster.
   */
  reconcileSeats(authoritativeSeats: Seat[]): void {
    const authoritativeIds = new Set(authoritativeSeats.map((seat) => seat.id))
    for (const seat of this.seats) {
      if (!authoritativeIds.has(seat.id)) this.removeSeat(seat.id)
    }

    const existingSeats = new Map(this.seats.map((seat) => [seat.id, seat]))
    this.seats = authoritativeSeats.map((seat) => {
      const existing = existingSeats.get(seat.id)
      const next = cloneSeat(seat)
      if (next.procedure && existing?.procedure) {
        next.procedure.attendance = existing.procedure.attendance
      }
      return next
    })
    this.touch()
  }

  removeSeat(id: string): void {
    if (!this.seats.some((seat) => seat.id === id)) return

    const removedSpeakerEntryIds = new Set(
      this.speakerList.entries.filter((entry) => entry.seatId === id).map((entry) => entry.id)
    )

    this.seats = this.seats.filter((seat) => seat.id !== id)
    this.speakerList.entries = this.speakerList.entries.filter((entry) => entry.seatId !== id)

    if (
      this.activeSpeaker &&
      (this.activeSpeaker.entryId === id || removedSpeakerEntryIds.has(this.activeSpeaker.entryId))
    ) {
      this.activeSpeaker = null
    }
    if (
      this.yieldPending &&
      (this.yieldPending.originalSeatId === id || this.yieldPending.questionerSeatId === id)
    ) {
      this.yieldPending = null
    }
    if (this.caucusSetup?.speakerSeatIds.includes(id)) {
      this.caucusSetup = {
        ...this.caucusSetup,
        speakerSeatIds: this.caucusSetup.speakerSeatIds.filter((seatId) => seatId !== id)
      }
    }
    if (this.activeCaucus?.caucusSpeakers?.some((entry) => entry.seatId === id)) {
      const currentSpeaker =
        this.activeCaucus.currentSpeakerIndex == null
          ? undefined
          : this.activeCaucus.caucusSpeakers[this.activeCaucus.currentSpeakerIndex]
      const caucusSpeakers = this.activeCaucus.caucusSpeakers.filter((entry) => entry.seatId !== id)
      const currentSpeakerIndex = currentSpeaker
        ? caucusSpeakers.findIndex((entry) => entry.id === currentSpeaker.id)
        : undefined

      this.activeCaucus = {
        ...this.activeCaucus,
        caucusSpeakers,
        currentSpeakerIndex:
          currentSpeakerIndex == null || currentSpeakerIndex < 0 ? undefined : currentSpeakerIndex
      }
    }

    this.touch()
  }

  getSeat(id: string): Seat | undefined {
    return this.seats.find((s) => s.id === id)
  }

  // ================================================================
  //  生命周期
  // ================================================================

  /** 销毁引擎：停止所有 timer */
  destroy(): void {
    for (const timer of this.timers.values()) {
      timer.stop()
    }
    this.timers.clear()
  }
}
