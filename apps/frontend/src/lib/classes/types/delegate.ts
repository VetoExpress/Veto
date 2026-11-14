// ============================================================
// types-delegate.ts — 代表端领域模型
// ============================================================
// SeatGroup、Seat、User、Directive、News、SituationUpdate 等
// 代表端核心类型定义。

import type {
  AuthenticatedSeatSession as SharedAuthenticatedSeatSession,
  Capability as SharedCapability,
  Directive as SharedDirective,
  DirectiveStatus as SharedDirectiveStatus,
  News as SharedNews,
  NewsStatus as SharedNewsStatus,
  SituationUpdate as SharedSituationUpdate
} from '../../../../../shared'
import { CAPABILITY_MESSAGE_KEYS } from '../../../../../shared/content-types'
import { getLocalizedLabels } from '../../../../../shared/action-types'
import { t } from '$lib/i18n'

// ---- 能力系统 -------------------------------------------------------------

/** Seat 可执行的操作能力 */
export type Capability = SharedCapability

export const CAPABILITY_LABELS = getLocalizedLabels(CAPABILITY_MESSAGE_KEYS, t)

/** 能力选项（顺序即 UI 展示顺序），由 CAPABILITY_LABELS 派生，禁止另立清单 */
export const CAPABILITY_OPTIONS: Array<{ value: Capability; label: string }> = Object.keys(
  CAPABILITY_LABELS
).map((value) => ({ value: value as Capability, get label() { return CAPABILITY_LABELS[value as Capability] } }))

// ---- 席位组 ---------------------------------------------------------------

/** 席位组类型 */
export type SeatGroupType = 'cabinet' | 'mpc' | 'ipc'

/** 内阁/委员会运行模式 */
export type CabinetMode = 'standing' | 'crisis'

/** 席位组 */
export interface SeatGroup {
  id: string
  /** 显示名称，如 "常规"、"MPC"、"IPC" */
  name: string
  /** 席位组类型 */
  type: SeatGroupType
  /** 默认能力集（Seat 级别可覆盖） */
  defaultCapabilities: Capability[]
  /** 排序权重 */
  sortOrder: number
}

// ---- 席位 -----------------------------------------------------------------

export type Attendance = 'present' | 'absent'

/** 仅议事席位具有的程序状态 */
export interface SeatProcedure {
  flagUrl?: string
  attendance: Attendance
  hasVotingRights: boolean
  /** Static veto eligibility; missing on legacy saved conferences. */
  hasVetoPower?: boolean
  sortOrder: number
}

/** 席位 */
export interface Seat {
  id: string
  /** 显示名称，如 "海军部长"、"新华社记者"、"推演官 A" */
  name: string
  shortName?: string
  /** 所属 SeatGroup ID */
  seatGroupId: string
  /** 当前使用者；席位尚未被认领时为空 */
  userId?: string
  /** 能力覆盖（只存与 SeatGroup 默认值不同的项） */
  capabilityOverrides: Partial<Record<Capability, boolean>>
  /** 角色/职务描述，如 "外交部长" */
  role?: string
  /** 引用的大会级角色模板 */
  roleId?: string
  /** 点名、发言和投票状态；MPC/IPC 席位没有该字段 */
  procedure?: SeatProcedure
}

export type ParticipantSeat = Seat & { procedure: SeatProcedure }

export function isParticipantSeat(seat: Seat): seat is ParticipantSeat {
  return seat.procedure != null
}

/** 界面、投屏和网络同步使用的安全席位投影 */
export interface SeatView {
  id: string
  name: string
  shortName?: string
  role?: string
  procedure?: SeatProcedure
}

export function toSeatView(seat: Seat): SeatView {
  return {
    id: seat.id,
    name: seat.name,
    shortName: seat.shortName,
    role: seat.role,
    procedure: seat.procedure ? { ...seat.procedure } : undefined
  }
}

// ---- 用户与访问 -----------------------------------------------------------

/** 大会内与一个席位一对一的本地用户 */
export interface User {
  id: string
  name: string
  passwordHash?: string
  passwordSalt?: string
}

/** 通过邀请码定位席位的访问入口 */
export interface SeatAccess {
  seatId: string
  inviteCode: string
}

export interface UserView {
  id: string
  name: string
  hasPassword: boolean
}

/** 代表端认证后使用的临时连接上下文，不持久化 */
export type AuthenticatedSeatSession = SharedAuthenticatedSeatSession

// ---- 指令 -----------------------------------------------------------------

/** Cloud-routed Directive. A target is always one Committee, never a Seat. */
export type Directive = SharedDirective
export type DirectiveStatus = SharedDirectiveStatus

// ---- 新闻 -----------------------------------------------------------------

export type News = SharedNews
export type NewsStatus = SharedNewsStatus

// ---- 局势更新 -------------------------------------------------------------

export type SituationUpdate = SharedSituationUpdate
