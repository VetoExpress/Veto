/**
 * conference-store.ts
 * ──────────────────────────────────────────────
 * 模拟大会状态管理 —— 薄包装层。
 *
 * - 内部使用 Committee 实例管理所有状态
 * - 对外保持 writable + derived stores API
 * - 持久化通过 toJSON() / fromJSON()
 */

import { writable, derived, get, type Readable } from 'svelte/store'
import type {
  Conference as ConferenceDTO,
  Committee as CommitteeDTO,
  ConferenceDisplayData,
  AgendaItem,
  YieldChoice,
  Motion,
  VoteBallot,
  ConferenceActionType,
  ConferencePhase
} from '$lib/classes/types/conference'
import type {
  PointType,
  Attendance,
  ProposerPosition,
  MajorityRule,
  VoteTargetType
} from '$lib/classes/types/conference'
import {
  isParticipantSeat,
  type Seat,
  type SeatAccess,
  type SeatGroup,
  type User
} from '$lib/classes/types/delegate'
import { Committee } from '$lib/classes/domain/committee.svelte'
import { Conference } from '$lib/classes/domain/conference.svelte'
import { tallyVotesEngine } from '$lib/classes/services/engine/conference-engine'
import { getDisplayBridge, buildDisplayData } from '$lib/classes/clients/conference-display-client'
import { bootstrapStore, saveToStore } from '../../helpers/store-bridge'
import { generateInviteCode } from '$lib/classes/services/seat-access'
import { createConferenceSaver } from '$lib/classes/services/conference-save'
import { makeCheckpoint, saveCheckpoint, restoreCheckpoint, type CommitteeCheckpoint } from '$lib/classes/services/committee-checkpoints'
import { destroyAllTimers } from '$lib/classes/services/timer/timer'

const STORAGE_KEY = 'veto_conferences'
const STORE_DOMAIN = 'conferences'
const saver = createConferenceSaver((data) => saveToStore(STORE_DOMAIN, data))
export const conferenceSaveStatus = saver.status
export const restoringCheckpoint = writable(false)
const savedPhases = new Map<string, ConferencePhase>()
let storageReady = false

// ---- 引擎注册表 ----------------------------------------------------------

/** 所有委员会引擎实例（按委员会 ID 索引） */
const _engines = new Map<string, Committee>()

/** 获取当前会议引擎（便捷方法） */
function getCurrentEngine(): Committee | undefined {
  const id = get(currentCommitteeId)
  if (!id) return undefined
  return _engines.get(id)
}

/** 注册引擎 */
function registerEngine(engine: Committee): void {
  _engines.set(engine.id, engine)
}

/** 注销引擎 */
function unregisterEngine(id: string): void {
  _engines.delete(id)
}

/** 将引擎当前状态同步到 conferences writable store（用于持久化） */
function syncEngine(engine: Committee): void {
  const conference = get(currentConferenceRecord)
  if (!conference || !conference.getCommittee(engine.id)) return
  conference.replaceCommittee(engine)
  conferences.update((list) => [...list])
  if (storageReady && savedPhases.get(engine.id) !== engine.phase) {
    savedPhases.set(engine.id, engine.phase)
    const checkpoint = makeCheckpoint(conference.id, engine, '阶段切换')
    void saveConferencesNow().then((saved) => saved && saveCheckpoint(checkpoint))
  }
}

/** 将当前委员会引擎的变更写回其所属大会。 */
export function syncCurrentCommittee(): void {
  const engine = getCurrentEngine()
  if (engine) syncEngine(engine)
}

/** 更新当前委员会的实质性投票规则并保存到大会记录。 */
export function setSubstantiveVotingMajority(majorityRule: MajorityRule): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.substantiveVotingMajority = majorityRule
  syncEngine(engine)
}

// ---- 文件持久化（双重写入：localStorage + 文件）--------------------------

function loadConferencesFromStorage(): Conference[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const list: ConferenceDTO[] = JSON.parse(raw)
    const conferences = list.map((conference) => Conference.fromJSON(conference))
    for (const conference of conferences) {
      for (const committee of conference.committees) registerEngine(committee)
    }
    return conferences
  } catch {
    return []
  }
}

let _saveTimer: ReturnType<typeof setTimeout> | null = null
function saveConferencesToStorage(confs: Conference[]): void {
  if (typeof localStorage === 'undefined' || !storageReady) return
  saver.pending()
  if (_saveTimer) clearTimeout(_saveTimer)
  _saveTimer = setTimeout(() => {
    _saveTimer = null
    void saver.save(confs.map((conference) => conference.toJSON()))
  }, 2000)
}

/** 立即保存（绕过防抖），用于离开页面前保存计时器状态 */
export async function saveConferencesNow(): Promise<boolean> {
  if (typeof localStorage === 'undefined' || !storageReady) return false
  if (_saveTimer) {
    clearTimeout(_saveTimer)
    _saveTimer = null
  }
  return saver.save(get(conferences).map((conference) => conference.toJSON()))
}

// ---- 核心 Stores ----------------------------------------------------------

/** 所有大会列表。 */
export const conferences = writable<Conference[]>(loadConferencesFromStorage())
conferences.subscribe(saveConferencesToStorage)

/** 启动完成 Promise：文件数据已加载并同步到 localStorage */
export async function retryConferenceStorage(): Promise<void> {
  if (storageReady) { await saveConferencesNow(); return }
  try {
  const data = await bootstrapStore<ConferenceDTO[]>(STORE_DOMAIN, [])
  if (!Array.isArray(data)) throw new Error('会议存档格式无效，原文件已保留')
  const restored = data.map((conference) => Conference.fromJSON(conference))
  for (const conference of restored) {
    for (const committee of conference.committees) {
      registerEngine(committee)
      savedPhases.set(committee.id, committee.phase)
    }
  }
  conferences.set(restored)
  storageReady = true
  saver.status.set({ state: 'saved' })
  } catch (error) { saver.fail(error) }
}
export const conferencesReady: Promise<void> = retryConferenceStorage()

export async function createCommitteeCheckpoint(label = '手动快照'): Promise<boolean> {
  const conference = get(currentConferenceRecord)
  const committee = getCurrentEngine()
  if (!conference || !committee || !storageReady) return false
  if (!await saveConferencesNow()) return false
  return saveCheckpoint(makeCheckpoint(conference.id, committee, label))
}

export async function restoreCommitteeCheckpoint(checkpoint: CommitteeCheckpoint): Promise<void> {
  if (get(restoringCheckpoint)) return
  const conference = get(currentConferenceRecord)
  const current = getCurrentEngine()
  if (!conference || !current || !storageReady) throw new Error('会议尚未加载完成')
  const restored = restoreCheckpoint(checkpoint, conference.id, current)
  restoringCheckpoint.set(true)
  try {
    destroyAllTimers()
    if (current.activeSpeaker) current.activeSpeaker = { ...current.activeSpeaker, paused: true }
    if (current.activeCaucus) current.activeCaucus = { ...current.activeCaucus, paused: true }
    if (!await saveCheckpoint(makeCheckpoint(conference.id, current, '恢复前自动备份'))) throw new Error('恢复前备份失败，当前会议已暂停')
    const data = get(conferences).map((item) => {
      const json = item.toJSON()
      return item.id === conference.id ? { ...json, committees: json.committees.map((committee) => committee.id === restored.id ? restored.toJSON() : committee) } : json
    })
    if (!await saver.save(data)) throw new Error('恢复保存失败，当前会议已暂停，原记录仍保留')
    registerEngine(restored)
    syncEngine(restored)
    getDisplayBridge().sendUpdate(buildDisplayData(restored))
  } finally { restoringCheckpoint.set(false) }
}

/** 当前激活的大会 ID */
export const currentConferenceId = writable<string | null>(null)

const LAST_OPENED_KEY = 'veto_last_opened_conference'

/** 最近一次打开的大会 ID（用于首页"继续上次"横幅，独立持久化，退出会议不清空） */
export const lastOpenedConferenceId = writable<string | null>(
  typeof localStorage !== 'undefined' ? localStorage.getItem(LAST_OPENED_KEY) : null
)
lastOpenedConferenceId.subscribe((id) => {
  if (typeof localStorage === 'undefined') return
  if (id) localStorage.setItem(LAST_OPENED_KEY, id)
  else localStorage.removeItem(LAST_OPENED_KEY)
})

/** 当前大会记录。 */
export const currentConferenceRecord = derived(
  [conferences, currentConferenceId],
  ([$conferences, $id]) => $conferences.find((c) => c.id === $id) ?? null
)

if (typeof window !== 'undefined' && window.veto?.events) {
  window.veto.events.on('conference:user-claimed', (data: unknown) => {
    const payload = data as { conferenceId: string; seatId: string; user: User }
    const conference = get(conferences).find((item) => item.id === payload.conferenceId)
    if (!conference) return
    const committee = conference.committees.find((item) => item.getSeat(payload.seatId))
    if (!committee) return
    conference.setUsers([
      ...conference.users.filter((user) => user.id !== payload.user.id),
      payload.user
    ])
    committee.updateSeat(payload.seatId, { userId: payload.user.id })
    conference.replaceCommittee(committee)
    conferences.update((items) => [...items])
  })
}

/** 当前委员会 ID。委员会的议事操作必须显式绑定到此 ID。 */
export const currentCommitteeId = writable<string | null>(null)

/** 当前委员会。 */
export const currentCommittee: Readable<Committee | null> = derived(
  [currentConferenceRecord, currentCommitteeId],
  ([$conference, $committeeId]) =>
    $committeeId ? ($conference?.getCommittee($committeeId) ?? null) : null
)

/** 动议编辑草稿（实时同步到 Display） */
export const motionDraft = writable<ConferenceDisplayData['motionDraft'] | null>(null)

/** 问题编辑草稿（实时同步到 Display） */
export const pointDraft = writable<ConferenceDisplayData['pointDraft'] | null>(null)

// ---- CRUD -----------------------------------------------------------------

export function createConference(
  name: string,
  committeeName: string,
  agendaItems: { title: string; description?: string }[],
  participants: { name: string; shortName?: string; hasVotingRights?: boolean }[],
  options?: {
    id?: string
    defaultSpeakingTimeSec?: number
    seatGroups?: SeatGroup[]
    users?: User[]
    seatAccesses?: SeatAccess[]
    committees?: CommitteeDTO[]
  }
): string {
  // 从创建向导等流程传入 id 时沿用该 id，否则自动生成
  const id = options?.id ?? crypto.randomUUID()

  const defaultGroupId = crypto.randomUUID()
  const seatList: Seat[] = participants.map((participant, sortOrder) => ({
    id: crypto.randomUUID(),
    name: participant.name,
    shortName: participant.shortName,
    seatGroupId: defaultGroupId,
    capabilityOverrides: {},
    procedure: {
      attendance: 'absent',
      hasVotingRights: participant.hasVotingRights ?? true,
      sortOrder
    }
  }))
  const existingCodes = new Set(
    get(conferences).flatMap((conference) =>
      conference.seatAccesses.map((access) => access.inviteCode)
    )
  )
  const seatAccesses =
    options?.seatAccesses ??
    seatList.map((seat) => ({
      seatId: seat.id,
      inviteCode: generateInviteCode(existingCodes)
    }))

  const agendaList: AgendaItem[] = agendaItems.map((a, i) => ({
    id: crypto.randomUUID(),
    title: a.title,
    description: a.description,
    sortOrder: i
  }))

  const initialCommittee: CommitteeDTO = {
    id: crypto.randomUUID(),
    name: committeeName,
    phase: 'preamble',
    agenda: agendaList,
    speakerLists: { id: 'main', name: '主发言名单', entries: [] },
    motions: [],
    dismissedResolvedMotionIds: [],
    points: [],
    dismissedPointIds: [],
    draftResolutions: [],
    documentNames: [],
    votingSessions: [],
    minutes: [],
    defaultSpeakingTimeSec: options?.defaultSpeakingTimeSec ?? 120,
    activeCaucus: null,
    activeSpeaker: null,
    seats: seatList
  }
  const committees = options?.committees ?? [initialCommittee]

  const conference = new Conference({
    id,
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    committees,
    users: options?.users ?? [],
    seatAccesses,
    roleTemplates: [],
    seatGroups: options?.seatGroups ?? [
      {
        id: defaultGroupId,
        name: committeeName,
        type: 'cabinet',
        defaultCapabilities: [],
        sortOrder: 0
      }
    ],
    news: [],
    situationUpdates: []
  })

  const firstCommittee = conference.getCommittee(committees[0]?.id ?? '')
  if (firstCommittee) {
    firstCommittee.addConferenceEntry('conference_created', `大会创建: ${name}（${committeeName}）`)
    firstCommittee.addConferenceEntry('phase_changed', '进入阶段: 会前准备')
    registerEngine(firstCommittee)
  }
  conferences.update((list) => [...list, conference])
  currentConferenceId.set(id)
  currentCommitteeId.set(firstCommittee?.id ?? null)
  lastOpenedConferenceId.set(id)
  return id
}

export function deleteConference(id: string): void {
  const conference = getConferenceById(id)
  conferences.update((list) => list.filter((c) => c.id !== id))
  for (const committee of conference?.committees ?? []) unregisterEngine(committee.id)
  if (get(lastOpenedConferenceId) === id) lastOpenedConferenceId.set(null)
  if (get(currentConferenceId) === id) {
    currentConferenceId.set(null)
    currentCommitteeId.set(null)
  }
}

export function renameConference(id: string, name: string): void {
  const conference = getConferenceById(id)
  if (!conference) return
  conference.rename(name)
  conferences.update((list) => [...list])
}

export function bindTimeline(conferenceId: string, timelineId: string | null): void {
  const conference = getConferenceById(conferenceId)
  if (!conference) return
  conference.bindTimeline(timelineId)
  conferences.update((list) => [...list])
}

export async function loadConference(id: string, committeeId?: string): Promise<void> {
  await conferencesReady

  const conf = getConferenceById(id)
  if (conf) {
    currentConferenceId.set(id)
    const selected = conf.getCommittee(committeeId ?? '') ?? conf.committees[0] ?? null
    currentCommitteeId.set(selected?.id ?? null)
    lastOpenedConferenceId.set(id)
  }
}

export function unloadConference(): void {
  currentConferenceId.set(null)
  currentCommitteeId.set(null)
}

/** Open the conference overview without selecting a committee. */
export function openConference(id: string): void {
  const conf = getConferenceById(id)
  if (!conf) return
  currentConferenceId.set(id)
  currentCommitteeId.set(null)
  lastOpenedConferenceId.set(id)
}

export function getConferenceById(id: string): Conference | null {
  return get(conferences).find((c) => c.id === id) ?? null
}

/** Replace an inactive local archive and register its committee engines. */
export function restoreSyncedConference(data: ConferenceDTO): void {
  if (get(currentConferenceId) === data.id) throw new Error('请先退出大会再恢复云端存档')
  const restored = Conference.fromJSON(data)
  const existing = getConferenceById(data.id)
  for (const committee of existing?.committees ?? []) unregisterEngine(committee.id)
  for (const committee of restored.committees) {
    registerEngine(committee)
    savedPhases.set(committee.id, committee.phase)
  }
  conferences.update((list) => [...list.filter((conference) => conference.id !== data.id), restored])
}

/** Reconcile a cloud Chair projection into the local procedure aggregate. */
export function reconcileCommitteeSeats(
  conferenceId: string,
  committeeId: string,
  seats: Seat[]
): void {
  const conference = getConferenceById(conferenceId)
  const committee = conference?.getCommittee(committeeId)
  if (!conference || !committee) return

  committee.reconcileSeats(seats)
  conference.replaceCommittee(committee)
  registerEngine(committee)
  conferences.update((list) => [...list])
}

// ---- 点名 -----------------------------------------------------------------

/** 更改参会席位出席状态（含会议记录 + Display 通知） */
export function changeSeatAttendance(
  seatId: string,
  newAttendance: Attendance,
  opts?: { silent?: boolean }
): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.changeSeatAttendance(seatId, newAttendance, opts)
  syncEngine(engine)
}

export function setSeatVotingRights(seatId: string, hasVotingRights: boolean): void {
  const engine = getCurrentEngine()
  if (!engine) return
  const seat = engine.getSeat(seatId)
  if (!seat?.procedure) return
  engine.updateSeat(seatId, {
    procedure: { ...seat.procedure, hasVotingRights }
  })
  syncEngine(engine)
}

export function completeRollCall(): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.completeRollCall()
  syncEngine(engine)
}

export function resetRollCall(): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.resetRollCall()
  syncEngine(engine)
}

export function updateSeat(id: string, updates: Partial<Seat>): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.updateSeat(id, updates)
  syncEngine(engine)
}

// ---- 主发言名单 ------------------------------------------------------------

export function openSpeakersList(): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.addConferenceEntry('phase_changed', '主发言名单已开启')
  syncEngine(engine)
}

export function addToSpeakersList(seatId: string, customTimeSec?: number): string {
  const engine = getCurrentEngine()
  if (!engine) return ''
  const id = engine.addToSpeakersList(seatId, customTimeSec)
  syncEngine(engine)
  return id
}

export function removeFromSpeakersList(entryId: string): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.removeFromSpeakersList(entryId)
  syncEngine(engine)
}

export function readySpeaker(entryId: string): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.readySpeakerEntry(entryId)
  syncEngine(engine)
}

export function startSpeaker(entryId: string): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.startSpeakingEntry(entryId)
  syncEngine(engine)
}

export function pauseSpeaker(): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.pauseSpeaking()
  syncEngine(engine)
}

export function resumeSpeaker(_remainingSec?: number): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.resumeSpeaking()
  syncEngine(engine)
}

export function endSpeaker(yieldChoice?: YieldChoice): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.endSpeaking(yieldChoice)
  syncEngine(engine)
}

// ---- 让渡 -----------------------------------------------------------------

export function handleYield(yieldChoice: YieldChoice): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.handleYield(yieldChoice)
  syncEngine(engine)
}

export function resolveYieldToChair(): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.resolveYieldToChair()
  syncEngine(engine)
}

export function resolveYieldToDelegate(targetSeatId: string): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.resolveYieldToDelegate(targetSeatId)
  syncEngine(engine)
}

export function resolveYieldToQuestion(questionerSeatId: string): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.resolveYieldToQuestion(questionerSeatId)
  syncEngine(engine)
}

export function resolveYieldToComment(commenterSeatId: string): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.resolveYieldToComment(commenterSeatId)
  syncEngine(engine)
}

export function cancelYieldPending(): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.cancelYieldPending()
  syncEngine(engine)
}

// ---- 动议 -----------------------------------------------------------------

export function proposeMotion(motionData: Omit<Motion, 'id' | 'proposedAt' | 'status'>): string {
  const engine = getCurrentEngine()
  if (!engine) return ''
  const id = engine.proposeMotion(motionData)
  syncEngine(engine)

  return id
}

export function proposePoint(data: { type: PointType; proposedBySeatId: string }): string {
  const engine = getCurrentEngine()
  if (!engine) return ''
  // Engine 方法名是 raisePoint
  const id = engine.raisePoint(data.type, data.proposedBySeatId)
  syncEngine(engine)
  // 推送问题到 Display
  getDisplayBridge().sendUpdate(buildDisplayData(engine))
  return id
}

export function dismissLatestPoint(): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.dismissLatestPoint()
  syncEngine(engine)
  getDisplayBridge().sendUpdate(buildDisplayData(engine))
}

export function approveMotion(motionId: string): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.approveMotion(motionId)
  syncEngine(engine)
  getDisplayBridge().sendUpdate(buildDisplayData(engine))
}

export function rejectMotion(motionId: string): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.rejectMotion(motionId)
  syncEngine(engine)
  getDisplayBridge().sendUpdate(buildDisplayData(engine))
}

export function dismissLastResolvedMotion(): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.dismissLastResolvedMotion()
  syncEngine(engine)
}

export function startCaucus(motionId: string): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.startCaucus(motionId)
  syncEngine(engine)
}

export function setCaucusProposerPosition(position: ProposerPosition): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.setCaucusProposerPosition(position)
  syncEngine(engine)
}

export function addToCaucusSpeakers(seatId: string): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.addToCaucusSpeakersSetup(seatId)
  syncEngine(engine)
}

export function removeFromCaucusSpeakers(seatId: string): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.removeFromCaucusSpeakersSetup(seatId)
  syncEngine(engine)
}

export function startCaucusWithSetup(): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.startCaucusWithSetup()
  syncEngine(engine)
}

export function advanceCaucusSpeaker(): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.advanceCaucusSpeaker()
  syncEngine(engine)
}

export function startCaucusSpeaker(): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.startCaucusSpeakerEntry()
  syncEngine(engine)
}

export function appendCaucusSpeaker(seatId: string): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.appendCaucusSpeaker(seatId)
  syncEngine(engine)
}

export function cancelCaucusSpeaker(): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.cancelCaucusSpeaker()
  syncEngine(engine)
}

export function pauseCaucus(): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.pauseCaucus()
  syncEngine(engine)
}

export function resumeCaucus(_remainingSec?: number): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.resumeCaucus()
  syncEngine(engine)
}

export function endCaucus(): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.endCaucus()
  syncEngine(engine)
}

// ---- 投票 -----------------------------------------------------------------

export function startVotingSession(
  targetType: VoteTargetType,
  targetId: string,
  majorityRule: MajorityRule
): string {
  const engine = getCurrentEngine()
  if (!engine) return ''
  const id = engine.startVotingSession(targetType, targetId, majorityRule)
  syncEngine(engine)
  return id
}

export function castVote(
  sessionId: string,
  seatId: string,
  vote: 'yes' | 'no' | 'abstain' | 'skip'
): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.castVote(sessionId, seatId, vote)
  syncEngine(engine)
}

export function closeVotingSession(sessionId: string): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.closeVotingSession(sessionId)
  syncEngine(engine)
}

export function tallyVotes(ballots: VoteBallot[]): { yes: number; no: number; abstain: number } {
  return tallyVotesEngine(ballots)
}

// ---- 决议 -----------------------------------------------------------------

export function addDocumentName(name: string): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.addDocumentName(name)
  syncEngine(engine)
}

export function introduceResolution(
  title: string,
  sponsors: string[],
  signatories: string[],
  content: string,
  agendaItemId?: string
): string {
  const engine = getCurrentEngine()
  if (!engine) return ''
  const id = engine.introduceResolution(title, sponsors, signatories, content, agendaItemId)
  syncEngine(engine)
  return id
}

// ---- 会议控制 --------------------------------------------------------------

export function suspendMeeting(): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.suspendMeeting()
  syncEngine(engine)
}

export function resumeMeeting(): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.resumeMeeting()
  syncEngine(engine)
}

export function closeMeeting(): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.closeMeeting()
  syncEngine(engine)
}

export function setPhase(phase: ConferencePhase): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.setPhase(phase)
  syncEngine(engine)
}

// ---- 会议记录 --------------------------------------------------------------

export function addConferenceEntry(
  actionType: ConferenceActionType,
  description: string,
  related?: {
    seatId?: string
    motionId?: string
    resolutionId?: string
  }
): void {
  const engine = getCurrentEngine()
  if (!engine) return
  engine.addConferenceEntry(actionType, description, related as any)
  syncEngine(engine)
}

// ---- 投票计算辅助（纯函数，导出复用）---------------------------------------

export function getPresentCount(seats: Seat[]): number {
  return seats.filter(isParticipantSeat).filter((seat) => seat.procedure.attendance === 'present')
    .length
}

/** 拥有投票权的出席代表人数（排除观察员） */
export function getVotingCount(seats: Seat[]): number {
  return seats
    .filter(isParticipantSeat)
    .filter((seat) => seat.procedure.attendance === 'present' && seat.procedure.hasVotingRights)
    .length
}

export function getSimpleMajorityThreshold(presentCount: number): number {
  return Math.floor(presentCount / 2) + 1
}

export function getTwoThirdsThreshold(presentCount: number): number {
  return Math.ceil((presentCount * 2) / 3)
}
