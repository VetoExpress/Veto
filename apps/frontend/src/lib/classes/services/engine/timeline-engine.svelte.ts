/**
 * TimelineEngine — 会议时间轴模拟器核心引擎
 *
 * 维护现实时间与模拟会议时间之间的映射关系，而非直接存储 currentTime。
 * 核心公式：simTime = simulationAnchor + (Date.now() - realAnchor) × ratio
 *
 * 每个时间线实例独立管理自己的状态和 RAF 循环。
 * 持久化由 timeline-store 统一处理，引擎通过 _onStateChange 回调通知 store。
 *
 * 使用 Svelte 5 $state rune 实现响应式，与 Committee 模式一致。
 */

// ─── 类型定义 ──────────────────────────────────────────────────────────

import { t } from '$lib/i18n'

export interface TimelineState {
  /** 现实时间锚点（Date.now()） */
  realAnchor: number
  /** 模拟时间锚点（JS 时间戳） */
  simulationAnchor: number
  /** 时间倍率：每现实秒对应的模拟秒数 */
  ratio: number
  /** 是否暂停 */
  paused: boolean
  /** 暂停时冻结的模拟时间 */
  pausedSimulationTime?: number
}

// ─── 常量 ──────────────────────────────────────────────────────────────

/** 倍率预设 */
export const RATIO_PRESETS = [
  { value: 1, label: '1x' },
  { value: 10, label: '10x' },
  { value: 60, get label() { return t('services_speed_minute') } },
  { value: 3600, get label() { return t('services_speed_hour') } },
  { value: 86400, get label() { return t('services_speed_day') } },
] as const

import { emitServiceEvent } from '$lib/classes/services/event-bus-bridge'

// ─── 引擎类 ────────────────────────────────────────────────────────────

export class TimelineEngine {
  /** 引擎对应的时间线 ID */
  id: string

  // 响应式状态（Svelte 5 $state rune）
  realAnchor: number = $state(0)
  simulationAnchor: number = $state(0)
  ratio: number = $state(1)
  paused: boolean = $state(true)
  pausedSimulationTime: number | undefined = $state(undefined)

  /** 缓存的计算结果：模拟时间（响应式，每帧更新） */
  private _simTime: number = $state(0)
  /** 缓存的 Date.now()（响应式，每帧更新） */
  private _realTime: number = $state(Date.now())

  private _rafId: ReturnType<typeof requestAnimationFrame> | null = null

  /** 上次触发里程碑的 sim 小时数（用于跨边界检测） */
  private _lastMilestoneHour: number = -1

  /** 状态变更回调（由 timeline-store 注入） */
  _onStateChange: ((state: TimelineState) => void) | undefined

  constructor(id: string, state: TimelineState) {
    this.id = id
    this._restore(state)
    this._startRaf()
  }

  // ── 计算属性（读取 $state → 自然响应式） ────────────────────────────

  /** 当前模拟时间（JS 时间戳） */
  get currentSimTime(): number {
    return this._simTime
  }

  /** 当前模拟时间（Date 对象） */
  get currentSimDate(): Date {
    return new Date(this._simTime)
  }

  /** 当前现实时间（JS 时间戳） */
  get currentRealTime(): number {
    return this._realTime
  }

  // ── 序列化 ──────────────────────────────────────────────────────────

  /** 导出当前状态（用于持久化） */
  serialize(): TimelineState {
    return {
      realAnchor: this.realAnchor,
      simulationAnchor: this.simulationAnchor,
      ratio: this.ratio,
      paused: this.paused,
      pausedSimulationTime: this.pausedSimulationTime,
    }
  }

  // ── 核心方法 ────────────────────────────────────────────────────────

  /** 暂停时间轴 */
  pause(): void {
    this.pausedSimulationTime = this._simTime
    this.paused = true
    this._save()
    emitServiceEvent('timeline:paused', {
      timelineId: this.id,
      name: '',
      pausedSimTime: this.pausedSimulationTime,
      ratio: this.ratio
    })
  }

  /** 恢复时间轴 */
  resume(): void {
    this.simulationAnchor = this.pausedSimulationTime ?? this._simTime
    this.realAnchor = Date.now()
    this.paused = false
    this.pausedSimulationTime = undefined
    this._save()
    emitServiceEvent('timeline:resumed', {
      timelineId: this.id,
      name: '',
      simTime: this._simTime,
      ratio: this.ratio
    })
  }

  /** 切换暂停/恢复 */
  togglePause(): void {
    if (this.paused) {
      this.resume()
    } else {
      this.pause()
    }
  }

  /** 设置时间倍率（保持模拟时间连续） */
  setRatio(newRatio: number): void {
    if (newRatio <= 0) return
    const oldRatio = this.ratio
    this.simulationAnchor = this._simTime
    this.realAnchor = Date.now()
    this.ratio = newRatio
    this._save()
    emitServiceEvent('timeline:ratio_changed', {
      timelineId: this.id,
      name: '',
      oldRatio,
      newRatio
    })
  }

  /** 跳转到指定模拟时间 */
  jumpTo(targetSimTime: number): void {
    this.simulationAnchor = targetSimTime
    this.realAnchor = Date.now()
    if (this.paused) {
      this.pausedSimulationTime = targetSimTime
    }
    this._simTime = targetSimTime
    this._realTime = Date.now()
    this._save()
  }

  /** 重置时间线（回到初始状态） */
  reset(initialSimTime?: number): void {
    const now = Date.now()
    const simStart = initialSimTime ?? new Date('2025-01-01T09:00:00').getTime()
    this.realAnchor = now
    this.simulationAnchor = simStart
    this.ratio = 1
    this.paused = true
    this.pausedSimulationTime = simStart
    this._simTime = simStart
    this._realTime = now
    this._save()
  }

  // ── 内部 ────────────────────────────────────────────────────────────

  /** 通知 store 状态已变更 */
  private _save(): void {
    this._onStateChange?.(this.serialize())
  }

  /** 从持久化状态恢复 */
  private _restore(state: TimelineState): void {
    this.realAnchor = state.realAnchor
    this.simulationAnchor = state.simulationAnchor
    this.ratio = state.ratio
    this.paused = state.paused
    this.pausedSimulationTime = state.pausedSimulationTime

    if (state.paused && state.pausedSimulationTime !== undefined) {
      this._simTime = state.pausedSimulationTime
    } else {
      // 未暂停：根据锚点公式计算（补偿关闭期间流逝时间）
      this._simTime = state.simulationAnchor + (Date.now() - state.realAnchor) * state.ratio
    }
    this._lastMilestoneHour = new Date(this._simTime).getHours()
    this._realTime = Date.now()
  }

  // ── RAF 循环 ────────────────────────────────────────────────────────

  private _startRaf(): void {
    if (this._rafId !== null) return
    const loop = () => {
      this._tick()
      this._rafId = requestAnimationFrame(loop)
    }
    this._rafId = requestAnimationFrame(loop)
  }

  /** 停止 RAF（页面离开时调用） */
  _stopRaf(): void {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId)
      this._rafId = null
    }
  }

  /** 每帧更新缓存的现实时间和模拟时间 */
  private _tick(): void {
    this._realTime = Date.now()
    if (!this.paused) {
      this._simTime =
        this.simulationAnchor + (this._realTime - this.realAnchor) * this.ratio
    }
    this._checkMilestone()
  }

  /** 检测模拟时间是否越过 00:00 或 12:00 整点，触发里程碑事件 */
  private _checkMilestone(): void {
    const simDate = new Date(this._simTime)
    const currentHour = simDate.getHours()

    if (currentHour !== this._lastMilestoneHour) {
      this._lastMilestoneHour = currentHour
      if (currentHour === 0 || currentHour === 12) {
        emitServiceEvent('timeline:time_milestone', {
          timelineId: this.id,
          simTime: this._simTime,
          isoDate: simDate.toISOString().slice(0, 10),
          hour: currentHour,
          ratio: this.ratio,
          paused: this.paused
        })
      }
    }
  }
}
