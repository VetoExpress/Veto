/**
 * conference-display-bridge.ts
 * ──────────────────────────────────────────────
 * Display 窗口通信抽象层。
 *
 * Display is a direct, local Chair-to-Display link. It deliberately does not
 * connect to the Cloud Service: the Chair owns its local procedure projection.
 */

import type {
  ConferenceDisplayData,
  SpeakerEntryStatus,
  SpeakerTransitionReason,
  CaucusSpeakerStatus,
  TimerTickData
} from '$lib/classes/types/conference'
import {
  isParticipantSeat,
  toSeatView,
  type Seat,
  type SeatView
} from '$lib/classes/types/delegate'
import { DISPLAY_STANDALONE_ID } from '$lib/classes/const'
import { applyLocale, getLocale } from '$lib/i18n'
import { isLocale } from '@vetoexpress/i18n'

// ---- 抽象接口 ------------------------------------------------------------

export interface ConferenceDisplayBridge {
  /** 打开显示窗口（通过 Electron IPC，因为需要创建 BrowserWindow） */
  openDisplay(conferenceId: string): Promise<boolean>
  /** 关闭显示窗口 */
  closeDisplay(): Promise<void>
  /** Push a full Chair projection to its bound local Display. */
  sendUpdate(data: ConferenceDisplayData): void
  /** 推送计时器增量数据（Host 端每 tick 发送，Display 端不维护计时器，见 ADR-0002） */
  sendTimerTick(data: TimerTickData): void
  /** Listen for a full Chair projection on the local Display. */
  onHostCommand(callback: (data: ConferenceDisplayData) => void): () => void
  /** 监听计时器增量更新（Display 端，与 onHostCommand 独立） */
  onTimerTick(callback: (data: TimerTickData) => void): () => void
}

// ---- Direct local display channel ----

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

let _wsListeners: Array<(data: ConferenceDisplayData) => void> = []
let _tickListeners: Array<(data: TimerTickData) => void> = []
let _statusListeners: Array<(status: ConnectionStatus) => void> = []
let _status: ConnectionStatus = 'disconnected'

type DisplaySocketRole = 'chair' | 'display'

interface DisplaySocketMessage {
  type: 'display_data' | 'timer_tick'
  committeeId: string
  data?: unknown
}

let displaySocket: WebSocket | null = null
let displaySocketRole: DisplaySocketRole | null = null
let displaySocketCommitteeId: string | undefined
const pendingDisplayMessages: DisplaySocketMessage[] = []

function setStatus(status: ConnectionStatus): void {
  for (const cb of _statusListeners) {
    cb(status)
  }
}

function currentStatus(): ConnectionStatus {
  return _status
}

function getActiveDisplayCommitteeId(): string | undefined {
  if (typeof window === 'undefined') return undefined
  const displayMatch = window.location.pathname.match(/^\/display\/([^/]+)/)
  if (displayMatch) return displayMatch[1]
  return window.location.pathname.match(/^\/(?:client|conference)\/[^/]+\/committee\/([^/]+)/)?.[1]
}

async function connectDisplaySocket(role: DisplaySocketRole, committeeId?: string): Promise<void> {
  const parsedCommitteeId = role === 'display' ? getActiveDisplayCommitteeId() : committeeId
  // 仅展示模式（standalone）不绑定 committeeId：服务端对无绑定 Display 放行全部 Chair 广播
  const nextCommitteeId =
    parsedCommitteeId === DISPLAY_STANDALONE_ID ? undefined : parsedCommitteeId
  if (
    displaySocket?.readyState === WebSocket.OPEN &&
    displaySocketRole === role &&
    displaySocketCommitteeId === nextCommitteeId
  ) {
    return
  }

  if (displaySocket?.readyState === WebSocket.CONNECTING && displaySocketRole === role) {
    displaySocketCommitteeId = nextCommitteeId
    return
  }

  displaySocket?.close()
  displaySocket = null
  displaySocketRole = role
  displaySocketCommitteeId = nextCommitteeId
  _status = 'connecting'
  setStatus(_status)

  // 非 Electron 环境（如浏览器打开）没有 displayWs 桥，直接标记断开，避免崩溃
  if (!window.veto?.displayWs) {
    _status = 'disconnected'
    setStatus(_status)
    return
  }

  const displayPort = await window.veto.displayWs.getPort()
  const query = new URLSearchParams({ role })
  if (nextCommitteeId) query.set('committeeId', nextCommitteeId)
  const socket = new WebSocket(`ws://127.0.0.1:${displayPort}?${query.toString()}`)
  displaySocket = socket

  socket.onopen = () => {
    if (displaySocket !== socket) return
    _status = 'connected'
    setStatus(_status)
    for (const message of pendingDisplayMessages.splice(0)) {
      socket.send(JSON.stringify(message))
    }
  }

  socket.onmessage = (event) => {
    if (displaySocket !== socket || role !== 'display') return
    try {
      const message = JSON.parse(String(event.data)) as DisplaySocketMessage
      if (message.type === 'timer_tick') {
        for (const callback of _tickListeners) callback(message.data as TimerTickData)
      } else if (message.type === 'display_data') {
        const data = message.data as ConferenceDisplayData
        if (isLocale(data.locale)) applyLocale(data.locale)
        for (const callback of _wsListeners) callback(data)
      }
    } catch {
      // Ignore malformed transport payloads.
    }
  }

  socket.onclose = () => {
    if (displaySocket !== socket) return
    displaySocket = null
    _status = 'disconnected'
    setStatus(_status)
  }

  socket.onerror = () => {
    if (displaySocket !== socket) return
    _status = 'disconnected'
    setStatus(_status)
  }
}

function queueDisplaySocketMessage(message: DisplaySocketMessage): void {
  if (displaySocket?.readyState === WebSocket.OPEN) {
    displaySocket.send(JSON.stringify(message))
    return
  }

  pendingDisplayMessages.push(message)
  void connectDisplaySocket('chair', message.committeeId)
}

/** Listen for the state of the Chair-to-Display local channel. */
export function onConnectionStatus(callback: (status: ConnectionStatus) => void): () => void {
  _statusListeners.push(callback)
  // 立即通知当前状态（解决 HMR 后状态丢失问题）
  callback(currentStatus())
  return () => {
    _statusListeners = _statusListeners.filter((cb) => cb !== callback)
  }
}

// ---- Chair bridge ----

function createHostBridge(): ConferenceDisplayBridge {
  return {
    openDisplay: async (conferenceId: string): Promise<boolean> => {
      if (typeof window === 'undefined' || !window.veto?.conference) return false
      const result = await window.veto.conference.openDisplay(conferenceId)
      return result.success
    },

    closeDisplay: async (): Promise<void> => {
      if (typeof window === 'undefined' || !window.veto?.conference) return
      await window.veto.conference.closeDisplay()
    },

    sendUpdate: (data: ConferenceDisplayData): void => {
      queueDisplaySocketMessage({
        type: 'display_data',
        committeeId: data.conferenceId,
        data
      })
    },

    sendTimerTick: (data: TimerTickData): void => {
      const committeeId = getActiveDisplayCommitteeId()
      if (!committeeId) return
      queueDisplaySocketMessage({ type: 'timer_tick', committeeId, data })
    },

    onHostCommand: (): (() => void) => {
      // Host 端不接收 Display 消息
      return () => {}
    },

    onTimerTick: (): (() => void) => {
      // Host 端不接收 Display 消息
      return () => {}
    }
  }
}

// ---- Display bridge ----

function createDisplayBridge(): ConferenceDisplayBridge {
  return {
    openDisplay: async (): Promise<boolean> => false,
    closeDisplay: async (): Promise<void> => {},

    sendUpdate: (): void => {
      // Display 端不发送更新
    },

    sendTimerTick: (): void => {
      // Display 端不发送更新
    },

    onHostCommand: (callback: (data: ConferenceDisplayData) => void): (() => void) => {
      _wsListeners.push(callback)
      void connectDisplaySocket('display')
      return () => {
        _wsListeners = _wsListeners.filter((cb) => cb !== callback)
      }
    },

    onTimerTick: (callback: (data: TimerTickData) => void): (() => void) => {
      _tickListeners.push(callback)
      void connectDisplaySocket('display')
      return () => {
        _tickListeners = _tickListeners.filter((cb) => cb !== callback)
      }
    }
  }
}

// ---- 单例 ----------------------------------------------------------------

let currentBridge: ConferenceDisplayBridge | null = null

export function getDisplayBridge(): ConferenceDisplayBridge {
  if (!currentBridge) {
    const isDisplay =
      typeof window !== 'undefined' &&
      (window.location.hash.includes('/display/') || window.location.pathname.includes('/display/'))
    currentBridge = isDisplay ? createDisplayBridge() : createHostBridge()
  }
  return currentBridge
}

/** 替换 bridge 实现（测试用） */
export function setDisplayBridge(bridge: ConferenceDisplayBridge): void {
  currentBridge = bridge
}

// ---- 辅助：从 Conference / Committee 构建 DisplayData -----------------

import type { Committee as CommitteeDTO } from '$lib/classes/types/conference'
import { tallyVotes } from '$lib/classes/stores/conference/conference-store'
import { calculateMajorityThresholds } from '$lib/classes/services/engine/conference-engine'
import type { Committee } from '$lib/classes/domain/committee.svelte'

/**
 * 构建 Display 窗口数据。
 * 接受 Committee（优先）或 Committee JSON。
 */
export interface ConferenceDisplayExtra {
  rollCall?: ConferenceDisplayData['rollCall']
  motionDraft?: ConferenceDisplayData['motionDraft']
  pointDraft?: ConferenceDisplayData['pointDraft']
  attendanceChange?: ConferenceDisplayData['attendanceChange']
  speakerTransition?: SpeakerTransitionReason
}

export function buildDisplayData(
  source: Committee | CommitteeDTO,
  extra?: ConferenceDisplayExtra
): ConferenceDisplayData {
  // 统一为 Committee JSON 格式
  const conf: CommitteeDTO = 'toJSON' in source ? source.toJSON() : source

  // 如果传入的是引擎，则使用引擎方法获取 seat 信息以优化查找
  const engine: Committee | null = 'toJSON' in source ? source : null
  const findSeat = (seatId: string): Seat | undefined =>
    engine?.getSeat(seatId) ?? conf.seats.find((seat) => seat.id === seatId)
  const findSeatView = (seatId: string): SeatView | undefined => {
    const seat = findSeat(seatId)
    return seat ? toSeatView(seat) : undefined
  }

  // 当前发言人
  let currentSpeakerSeat: Seat | undefined
  let currentSpeakerAllocatedSec = 120

  if (conf.activeSpeaker) {
    // 优先从引擎获取（带 seat 引用）
    const engineEntry = engine?.speakerList.entries.find(
      (s) => s.id === conf.activeSpeaker!.entryId
    )
    if (engineEntry) {
      currentSpeakerSeat = conf.seats.find((d) => d.id === engineEntry.seatId)
      currentSpeakerAllocatedSec = engineEntry.allocatedTimeSec
    } else {
      // 回退：从 conf 数据查找
      const entry = conf.speakerLists?.entries.find((s) => s.id === conf.activeSpeaker!.entryId)
      if (entry) {
        const del = conf.seats.find((d) => d.id === entry.seatId)
        currentSpeakerSeat = del
        currentSpeakerAllocatedSec = entry.allocatedTimeSec
      } else if (conf.activeCaucus?.caucusSpeakers) {
        const cs = conf.activeCaucus.caucusSpeakers.find(
          (s) => s.seatId === conf.activeSpeaker!.entryId && s.status === 'speaking'
        )
        if (cs) {
          currentSpeakerSeat = conf.seats.find((d) => d.id === cs.seatId)
          currentSpeakerAllocatedSec = cs.allocatedTimeSec
        }
      }
    }
  }

  // 当前投票：优先进行中的，否则回退到最近一次已结束的（展示结果）
  const activeVoting =
    conf.votingSessions.find((s) => !s.endedAt) ??
    (() => {
      const ended = conf.votingSessions
        .filter((s) => s.endedAt)
        .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
      return ended[0]
    })()
  let votingData: ConferenceDisplayData['votingSession'] | undefined
  if (activeVoting) {
    const tally = tallyVotes(activeVoting.ballots)
    const participantSeats = conf.seats.filter(isParticipantSeat)
    const thresholds = calculateMajorityThresholds(participantSeats)

    // 构建每个有投票权的出席席位的投票状态（排除观察员）
    const presentSeats = participantSeats
      .filter((seat) => seat.procedure.attendance === 'present' && seat.procedure.hasVotingRights)
      .sort((a, b) => a.procedure.sortOrder - b.procedure.sortOrder)

    const ballotsDisplay = presentSeats.map((d) => {
      const ballot = activeVoting.ballots.find((b) => b.seatId === d.id)
      return {
        seatId: d.id,
        seatName: d.name,
        shortName: d.shortName,
        vote: ballot?.vote ?? null
      }
    })

    votingData = {
      targetDescription: activeVoting.targetType,
      targetType: activeVoting.targetType,
      majorityRule: activeVoting.majorityRule,
      tally: { ...tally, present: thresholds.presentCount },
      result: activeVoting.result,
      round: activeVoting.round ?? 1,
      currentSeatId: activeVoting.currentSeatId ?? null,
      ballots: ballotsDisplay
    }
  }

  // 当前动议
  const pendingMotion = conf.motions.find((m) => m.status === 'pending')

  // 最近被处理的动议（通过/否决），用于 Display 展示表决结果
  // 仅在动议阶段已结束（非 editing / voting）时才回退到已处理的动议，
  // 避免进入新一轮 editing 时错误展示上一次的表决结果
  // 特殊动议（isRequestingVote: false）不触发动议阶段，避免 Display 展示表决 UI
  const hasActiveMotionPhase =
    extra?.motionDraft?.isRequestingVote === true ||
    conf.motions.some((m) => m.status === 'pending')
  const resolvedMotions = conf.motions.filter(
    (m) =>
      (m.status === 'approved' || m.status === 'rejected') &&
      !conf.dismissedResolvedMotionIds.includes(m.id) &&
      m.type !== 'change_attendance'
  )
  const lastResolvedMotion =
    resolvedMotions.length > 0 ? resolvedMotions[resolvedMotions.length - 1] : undefined
  const displayMotion = pendingMotion ?? (!hasActiveMotionPhase ? lastResolvedMotion : undefined)

  // 磋商计时
  let caucusData: ConferenceDisplayData['caucusTimer'] | undefined
  if (conf.activeCaucus) {
    const remainingSec = Math.max(0, conf.activeCaucus.totalSec - conf.activeCaucus.elapsedSec)
    const totalSec = conf.activeCaucus.totalSec
    const status =
      conf.activeCaucus.paused || (conf.activeSpeaker?.paused ?? false)
        ? ('paused' as const)
        : ('running' as const)
    caucusData = {
      remainingSec,
      totalSec,
      type: conf.activeCaucus.type,
      status,
      topic: (() => {
        const motion = conf.motions.find((m) => m.id === conf.activeCaucus?.motionId)
        if (!motion) return undefined
        if (motion.type === 'moderated_caucus' || motion.type === 'moderated_debate') {
          return motion.topic
        }
        if (motion.type === 'individual_speech') {
          return conf.seats.find((seat) => seat.id === motion.proposedBySeatId)?.name
        }
        return undefined
      })(),
      caucusSpeakers: conf.activeCaucus.caucusSpeakers
        ?.map((s) => {
          const seat = conf.seats.find((d) => d.id === s.seatId)
          return seat
            ? {
                seatName: seat.name,
                seat: toSeatView(seat),
                status: s.status as CaucusSpeakerStatus,
                allocatedTimeSec: s.allocatedTimeSec
              }
            : null
        })
        .filter(
          (
            speaker
          ): speaker is {
            seatName: string
            seat: SeatView
            status: CaucusSpeakerStatus
            allocatedTimeSec: number
          } => speaker !== null
        ),
      currentSpeakerIndex: conf.activeCaucus.currentSpeakerIndex,
      speakerTransition: extra?.speakerTransition
    }
  }

  // 动议活跃时覆盖 phase 为 'motion'（Display 专用）
  const effectivePhase: ConferenceDisplayData['phase'] = hasActiveMotionPhase
    ? 'motion'
    : conf.phase

  return {
    locale: getLocale(),
    conferenceId: conf.id,
    phase: effectivePhase,
    venue: conf.name,
    name: conf.name,
    presentCount: conf.seats
      .filter(isParticipantSeat)
      .filter((seat) => seat.procedure.attendance === 'present').length,
    votingCount: conf.seats
      .filter(isParticipantSeat)
      .filter((seat) => seat.procedure.attendance === 'present' && seat.procedure.hasVotingRights)
      .length,
    currentSpeaker: (() => {
      if (!currentSpeakerSeat) return undefined
      const remainingSec = conf.activeSpeaker
        ? Math.max(0, conf.activeSpeaker.totalSec - conf.activeSpeaker.elapsedSec)
        : 0
      const status = conf.activeSpeaker?.paused ? ('paused' as const) : ('playing' as const)
      return {
        seat: toSeatView(currentSpeakerSeat),
        remainingSec,
        allocatedSec: currentSpeakerAllocatedSec,
        status
      }
    })(),
    readySpeaker: (() => {
      // 优先从引擎获取（带 seat 引用）
      const engineReady = engine?.readySpeaker
      if (engineReady) {
        const seat = conf.seats.find((d) => d.id === engineReady.seatId)
        return seat ? { seat: toSeatView(seat) } : undefined
      }
      // 回退：从 conf 数据查找
      const ready = conf.speakerLists?.entries.find((s) => s.status === 'ready')
      if (!ready) return undefined
      const d = conf.seats.find((del) => del.id === ready.seatId)
      return d ? { seat: toSeatView(d) } : undefined
    })(),
    speakersList: (() => {
      // 优先从引擎获取
      if (engine) {
        return engine.speakerList.entries
          .map((s) => ({
            seat: conf.seats.find((d) => d.id === s.seatId),
            status: s.status
          }))
          .filter(
            (speaker): speaker is { seat: Seat; status: SpeakerEntryStatus } =>
              speaker.seat !== undefined
          )
          .map((speaker) => ({ ...speaker, seat: toSeatView(speaker.seat) }))
      }
      // 回退：从 conf 数据查找
      return (conf.speakerLists?.entries ?? [])
        .map((s) => ({
          seat: conf.seats.find((del) => del.id === s.seatId),
          status: s.status
        }))
        .filter(
          (speaker): speaker is { seat: Seat; status: SpeakerEntryStatus } =>
            speaker.seat !== undefined
        )
        .map((speaker) => ({ ...speaker, seat: toSeatView(speaker.seat) }))
    })(),
    votingSession: votingData,
    activeMotion: displayMotion
      ? (() => {
          const proposedBy = findSeatView(displayMotion.proposedBySeatId)
          if (!proposedBy) return undefined
          return {
            type: displayMotion.type,
            topic:
              displayMotion.type === 'moderated_caucus' ||
              displayMotion.type === 'moderated_debate'
                ? displayMotion.topic
                : undefined,
            status: displayMotion.status,
            proposedBy,
            motionId: displayMotion.id,
            totalTimeSec:
              displayMotion.type === 'moderated_caucus'
                ? (displayMotion as any).totalTimeSec
                : displayMotion.type === 'unmoderated_caucus'
                  ? (displayMotion as any).durationSec
                  : displayMotion.type === 'moderated_debate' ||
                      displayMotion.type === 'unmoderated_debate'
                    ? (displayMotion as any).durationSec
                    : displayMotion.type === 'individual_speech'
                      ? (displayMotion as any).durationSec
                      : undefined,
            speakingTimePerPersonSec:
              displayMotion.type === 'moderated_caucus'
                ? (displayMotion as any).speakingTimePerPersonSec
                : undefined,
            newTimeSec:
              displayMotion.type === 'modify_speaking_time'
                ? (displayMotion as any).newTimeSec
                : undefined,
            documentName:
              displayMotion.type === 'substantive_vote'
                ? (displayMotion as any).documentName
                : undefined
          }
        })()
      : undefined,
    activePoint: (() => {
      const latestPoint = conf.points?.length > 0 ? conf.points[conf.points.length - 1] : undefined
      if (!latestPoint) return undefined
      if (conf.dismissedPointIds?.includes(latestPoint.id)) return undefined
      if (Date.now() - latestPoint.proposedAt > 8000) return undefined
      const proposedBy = findSeatView(latestPoint.proposedBySeatId)
      if (!proposedBy) return undefined
      return {
        type: latestPoint.type,
        proposedBy,
        pointId: latestPoint.id
      }
    })(),
    caucusTimer: caucusData,
    caucusSetup: conf.caucusSetup
      ? (() => {
          const csMotion = conf.motions.find((m) => m.id === conf.caucusSetup!.motionId) as any
          const proposer = conf.seats.find((seat) => seat.id === csMotion?.proposedBySeatId)
          return {
            topic: csMotion?.topic,
            proposerName: proposer?.name,
            proposerPosition: conf.caucusSetup!.proposerPosition,
            speakerSeatIds: conf.caucusSetup!.speakerSeatIds,
            speakerNames: conf
              .caucusSetup!.speakerSeatIds.map(findSeatView)
              .filter((seat): seat is SeatView => seat !== undefined)
          }
        })()
      : undefined,
    recentMinutes: conf.minutes.slice(-10).map((m) => ({
      timestamp: m.timestamp,
      eventType: m.actionType,
      description: m.description,
      messageKey: m.messageKey,
      messageValues: m.messageValues ? { ...m.messageValues } : undefined
    })),
    yieldPending: conf.yieldPending
      ? (() => {
          const originalSeat = findSeatView(conf.yieldPending!.originalSeatId)
          if (!originalSeat) return undefined
          return {
            yieldType: conf.yieldPending.yieldType,
            originalSeat,
            remainingSec: Math.round(conf.yieldPending.remainingSec),
            questionerSeat: conf.yieldPending.questionerSeatId
              ? findSeatView(conf.yieldPending.questionerSeatId)
              : undefined
          }
        })()
      : undefined,
    rollCall: extra?.rollCall,
    attendanceChange: extra?.attendanceChange,
    motionDraft: extra?.motionDraft,
    pointDraft: extra?.pointDraft
  }
}
