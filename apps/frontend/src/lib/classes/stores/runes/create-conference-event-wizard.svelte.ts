// ============================================================
// create-conference-event-wizard.svelte.ts — 创建大会向导草稿
// 五步创建向导（大会信息/会场规划/角色权限/席位分配/确认创建）的草稿与校验，
// 以 rune 单例驻留内存（刷新即清空，不持久化草稿——与重构前行为一致）。
// 提交复用 conference-event-store.createConferenceFromDraft 完成持久化。
// 本目录（stores/runes/）为 rune 系 store 的约定位置。
// ============================================================
import type { Capability, SeatGroupType } from '../../types/delegate'
import { t } from '$lib/i18n'
import type { RoleTemplate } from '../../types/event'
import type { ProcedureRulesConfig } from '../../types/procedure-rules'
import { defaultProcedureRules } from '../../utils/committee/procedure-rules'
import { createConferenceFromDraft } from '../conference/conference-event-store'

export interface SeatDraft {
  id: string
  name: string
  shortName: string
  roleId?: string
  hasVotingRights?: boolean
  hasVetoPower?: boolean
}

export interface AgendaItemDraft {
  id: string
  title: string
  description?: string
}

export interface CommitteeDraft {
  id: string
  name: string
  type: SeatGroupType
  seats: SeatDraft[]
  procedureRules: ProcedureRulesConfig
  agenda?: AgendaItemDraft[]
}

export type ConferenceCreateMode = 'conference' | 'singleton'

const MPC_REPORTER_ROLE_NAME = 'MPC记者'
const IPC_ROLE_NAME = 'IPC'
const STAFF_ROLE_NAME = 'Staff'

function newSeat(roleId?: string): SeatDraft {
  return {
    id: crypto.randomUUID(),
    name: '',
    shortName: '',
    roleId,
    hasVotingRights: true,
    hasVetoPower: false
  }
}

function newCommittee(): CommitteeDraft {
  return {
    id: crypto.randomUUID(),
    name: '',
    type: 'cabinet',
    seats: [],
    procedureRules: defaultProcedureRules()
  }
}

/** 向导默认预置的五个角色模板（随 reset 每次重新生成 id） */
const rolePresets: Array<Omit<RoleTemplate, 'id'>> = [
  {
    name: '常规代表',
    capabilities: [
      'view_conference',
      'view_situation',
      'view_news',
      'view_files',
      'submit_directive',
      'send_files',
      'draft_resolution'
    ],
    builtIn: true
  },
  {
    name: 'MPC 记者',
    capabilities: ['view_conference', 'view_situation', 'view_news', 'view_files', 'draft_news', 'send_files'],
    builtIn: true
  },
  {
    name: '观察员',
    capabilities: ['view_conference', 'view_situation', 'view_news', 'view_files'],
    builtIn: true
  },
  {
    name: 'IPC',
    capabilities: [
      'view_conference',
      'view_situation',
      'view_news',
      'view_files',
      'process_directive',
      'review_news',
      'publish_situation',
      'control_conference'
    ],
    builtIn: true
  },
  {
    name: STAFF_ROLE_NAME,
    capabilities: [
      'view_conference',
      'view_situation',
      'view_news',
      'view_files',
      'draft_news',
      'review_news',
      'submit_directive',
      'process_directive',
      'send_files',
      'publish_situation',
      'control_conference',
      'draft_resolution'
    ],
    builtIn: true
  }
]

function createDefaultRoles(): RoleTemplate[] {
  return rolePresets.map((preset) => ({
    ...preset,
    id: crypto.randomUUID(),
    capabilities: [...preset.capabilities]
  }))
}

export class ConferenceCreateWizard {
  mode = $state<ConferenceCreateMode | null>(null)
  eventName = $state('')
  eventDescription = $state('')
  organizer = $state('')
  roles = $state<RoleTemplate[]>(createDefaultRoles())
  committees = $state<CommitteeDraft[]>([])
  agendaItems = $state<AgendaItemDraft[]>([])
  creating = $state(false)
  createError = $state('')
  /** “下一步/跳步”尝试过且当前步未通过校验——各步页面据此显示内联错误 */
  attempted = $state(false)

  get totalSeatCount(): number {
    return this.committees.reduce((sum, committee) => sum + committee.seats.length, 0)
  }

  roleUsage(): Map<string, number> {
    const usage = new Map<string, number>()
    for (const committee of this.committees) {
      for (const seat of committee.seats) {
        if (seat.roleId) usage.set(seat.roleId, (usage.get(seat.roleId) ?? 0) + 1)
      }
    }
    return usage
  }

  get eventValid(): boolean {
    return this.eventName.trim().length > 0
  }

  get modeValid(): boolean {
    return this.mode !== null
  }

  get committeeValid(): boolean {
    return (
      this.committees.length > 0 &&
      (this.mode === 'singleton'
        ? this.committees.length === 1 && this.committees[0]?.type === 'cabinet'
        : true) &&
      this.committees.every((committee) => committee.name.trim().length > 0)
    )
  }

  get roleValid(): boolean {
    return (
      this.roles.length > 0 &&
      this.roles.every((role) => role.name.trim().length > 0 && role.capabilities.length > 0)
    )
  }

  get seatValid(): boolean {
    if (this.mode === 'singleton') {
      return (
        this.committeeValid &&
        this.committees.every(
          (committee) =>
            committee.seats.length > 0 &&
            committee.seats.every((seat) => seat.name.trim().length > 0)
        )
      )
    }

    return (
      this.committeeValid &&
      this.committees.every(
        (committee) =>
          committee.seats.length > 0 &&
          committee.seats.every(
            (seat) => {
              const roleId = seat.roleId
              return (
                seat.name.trim().length > 0 &&
                roleId != null &&
                this.roles.some((role) => role.id === roleId) &&
                this.isRoleAllowedInCommittee(roleId, committee.type)
              )
            }
          )
      )
    )
  }

  setMode(mode: ConferenceCreateMode): void {
    this.mode = mode

    if (mode !== 'singleton') return
    this.committees = this.committees.length > 0 ? [this.committees[0]] : [newCommittee()]
  }

  /** 第 step 步（0-5）当前是否通过校验；确认页恒为 true */
  isStepValid(step: number): boolean {
    if (step <= 0) return this.modeValid
    if (step === 1) return this.eventValid
    if (step === 2) return this.committeeValid
    if (step === 3) return this.roleValid
    if (step === 4) return this.seatValid
    return true
  }

  /** 第一个未完成步骤（0-5）；全部完成时为确认页 */
  firstIncompleteStep(): number {
    for (let step = 0; step < 5; step += 1) {
      if (!this.isStepValid(step)) return step
    }
    return 5
  }

  isStepValidById(
    stepId: 'mode' | 'event' | 'meeting' | 'roles' | 'seats' | 'review' | 'platform'
  ): boolean {
    if (stepId === 'mode') return this.modeValid
    if (stepId === 'platform') return true
    if (stepId === 'event') return this.eventValid
    if (stepId === 'meeting') return this.committeeValid
    if (stepId === 'roles') return this.roleValid
    if (stepId === 'seats') return this.seatValid
    return true
  }

  roleName(roleId: string): string {
    return this.roles.find((role) => role.id === roleId)?.name || t('services_no_role')
  }

  isMpcReporterRole(roleId: string): boolean {
    return this.roleName(roleId).replace(/\s+/g, '') === MPC_REPORTER_ROLE_NAME
  }

  isIpcRole(roleId: string): boolean {
    return this.roleName(roleId).replace(/\s+/g, '') === IPC_ROLE_NAME
  }

  isStaffRole(roleId: string): boolean {
    return this.roleName(roleId).trim() === STAFF_ROLE_NAME
  }

  isRoleAllowedInCommittee(roleId: string, committeeType: SeatGroupType): boolean {
    if (this.isStaffRole(roleId)) return true
    if (committeeType === 'mpc') return this.isMpcReporterRole(roleId) || this.isIpcRole(roleId)
    if (committeeType === 'ipc') return this.isIpcRole(roleId)
    return !this.isMpcReporterRole(roleId)
  }

  reset(): void {
    this.mode = null
    this.eventName = ''
    this.eventDescription = ''
    this.organizer = ''
    this.roles = createDefaultRoles()
    this.committees = [newCommittee()]
    this.agendaItems = []
    this.creating = false
    this.createError = ''
    this.attempted = false
  }

  addCommittee(): void {
    this.committees = [...this.committees, newCommittee()]
  }

  removeCommittee(id: string): void {
    this.committees = this.committees.filter((committee) => committee.id !== id)
  }

  addAgendaItem(): void {
    this.agendaItems = [
      ...this.agendaItems,
      { id: crypto.randomUUID(), title: '', description: '' }
    ]
  }

  removeAgendaItem(id: string): void {
    this.agendaItems = this.agendaItems.filter((item) => item.id !== id)
  }

  addRole(): void {
    this.roles = [...this.roles, { id: crypto.randomUUID(), name: '', capabilities: ['view_conference'] }]
  }

  removeRole(id: string): void {
    if ((this.roleUsage().get(id) ?? 0) > 0) return
    this.roles = this.roles.filter((role) => role.id !== id)
  }

  toggleCapability(roleId: string, capability: Capability): void {
    this.roles = this.roles.map((role) => {
      if (role.id !== roleId) return role
      const enabled = role.capabilities.includes(capability)
      return {
        ...role,
        capabilities: enabled
          ? role.capabilities.filter((item) => item !== capability)
          : [...role.capabilities, capability]
      }
    })
  }

  addSeat(committeeId: string): void {
    this.committees = this.committees.map((committee) => {
      if (committee.id !== committeeId) return committee
      if (this.mode === 'singleton') {
        return { ...committee, seats: [...committee.seats, newSeat()] }
      }

      const roleId =
        this.roles.find((role) => this.isRoleAllowedInCommittee(role.id, committee.type))?.id ?? ''
      return {
        ...committee,
        seats: [...committee.seats, newSeat(roleId)]
      }
    })
  }

  /** 将外部导入的席位追加到指定委员会。 */
  addImportedSeats(
    committeeId: string,
    seats: Array<{
      name: string
      shortName?: string
      roleId?: string
      hasVotingRights?: boolean
      hasVetoPower?: boolean
    }>
  ): void {
    this.committees = this.committees.map((committee) => {
      if (committee.id !== committeeId) return committee
      const fallbackRoleId =
        this.roles.find((role) => this.isRoleAllowedInCommittee(role.id, committee.type))?.id ?? ''
      return {
        ...committee,
        seats: [
          ...committee.seats,
          ...seats.map((seat) => ({
            id: crypto.randomUUID(),
            name: seat.name,
            shortName: seat.shortName ?? '',
            roleId: this.mode === 'singleton' ? undefined : (seat.roleId ?? fallbackRoleId),
            hasVotingRights: seat.hasVotingRights ?? true,
            hasVetoPower: seat.hasVetoPower ?? false
          }))
        ]
      }
    })
    this.syncCommitteeVeto(committeeId)
  }

  setSeatVotingRights(committeeId: string, seatId: string, hasVotingRights: boolean): void {
    this.committees = this.committees.map((committee) => {
      if (committee.id !== committeeId) return committee
      return {
        ...committee,
        seats: committee.seats.map((seat) =>
          seat.id === seatId
            ? { ...seat, hasVotingRights, hasVetoPower: hasVotingRights ? seat.hasVetoPower : false }
            : seat
        )
      }
    })
    this.syncCommitteeVeto(committeeId)
  }

  setSeatVetoPower(committeeId: string, seatId: string, hasVetoPower: boolean): void {
    this.committees = this.committees.map((committee) => {
      if (committee.id !== committeeId) return committee
      return {
        ...committee,
        seats: committee.seats.map((seat) =>
          seat.id === seatId
            ? { ...seat, hasVetoPower: Boolean(seat.hasVotingRights) && hasVetoPower }
            : seat
        )
      }
    })
    this.syncCommitteeVeto(committeeId)
  }

  setCommitteeProcedureRules(committeeId: string, config: ProcedureRulesConfig): boolean {
    let updated = false
    this.committees = this.committees.map((committee) => {
      if (committee.id !== committeeId) return committee
      updated = true
      return {
        ...committee,
        procedureRules: {
          ...config,
          veto: {
            enabled: committee.seats.some((seat) => seat.hasVetoPower),
            seatIds: committee.seats.filter((seat) => seat.hasVetoPower).map((seat) => seat.id)
          }
        }
      }
    })
    return updated
  }

  procedureSeats(committeeId: string): import('../../types/delegate').Seat[] {
    const committee = this.committees.find((item) => item.id === committeeId)
    if (!committee) return []
    return committee.seats.map((seat, sortOrder) => ({
      id: seat.id,
      name: seat.name,
      shortName: seat.shortName || undefined,
      seatGroupId: committee.id,
      capabilityOverrides: {},
      roleId: seat.roleId,
      procedure: {
        attendance: 'absent',
        hasVotingRights: seat.hasVotingRights ?? true,
        hasVetoPower: seat.hasVetoPower ?? false,
        sortOrder
      }
    }))
  }

  removeSeat(committeeId: string, seatId: string): void {
    this.committees = this.committees.map((committee) => {
      if (committee.id !== committeeId) return committee
      return { ...committee, seats: committee.seats.filter((seat) => seat.id !== seatId) }
    })
    this.syncCommitteeVeto(committeeId)
  }

  private syncCommitteeVeto(committeeId: string): void {
    this.committees = this.committees.map((committee) => {
      if (committee.id !== committeeId) return committee
      const seatIds = committee.seats.filter((seat) => seat.hasVetoPower).map((seat) => seat.id)
      return {
        ...committee,
        procedureRules: {
          ...committee.procedureRules,
          veto: { enabled: seatIds.length > 0, seatIds }
        }
      }
    })
  }

  /** 校验全部步骤并调用持久层创建大会；成功返回 eventId，失败返回 null（错误在 createError） */
  async submit(): Promise<string | null> {
    if (
      !this.modeValid ||
      !this.eventValid ||
      !this.committeeValid ||
      (this.mode !== 'singleton' && !this.roleValid) ||
      !this.seatValid ||
      this.creating
    ) {
      return null
    }

    this.creating = true
    this.createError = ''
    try {
      const eventId = await createConferenceFromDraft({
        name: this.eventName,
        mode: this.mode,
        description: this.eventDescription,
        organizer: this.organizer,
        roleTemplates: this.mode === 'singleton' ? [] : this.roles,
        committees:
          this.mode === 'singleton'
            ? this.committees.map((committee) => ({ ...committee, agenda: this.agendaItems }))
            : this.committees
      })
      if (!eventId) {
        this.createError = t('services_create_invalid')
        return null
      }
      return eventId
    } catch {
      this.createError = t('services_create_failed')
      return null
    } finally {
      this.creating = false
    }
  }
}

/** 全局唯一的向导草稿实例（应用存活期内驻留内存） */
export const wizard = new ConferenceCreateWizard()
