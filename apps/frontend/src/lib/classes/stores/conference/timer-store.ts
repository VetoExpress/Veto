import { writable } from 'svelte/store'
import { createTimer, getTimer } from '$lib/classes/services/engine/conference-engine'

// ── 类型 ──

export interface StandaloneTimerState {
  totalSec: number
  remainingSec: number
  isRunning: boolean
}

// ── Store ──

/** 全局独立计时器状态（null = 无活跃计时器） */
export const standaloneTimer = writable<StandaloneTimerState | null>(null)

/** 计时器对话框开关 */
export const timerDialogOpen = writable(false)

// ── 内部 Timer 管理 ──

const TIMER_ID = 'standalone-timer'

function _storeValue(): StandaloneTimerState | null {
  let v: StandaloneTimerState | null = null
  standaloneTimer.subscribe(($v) => (v = $v))()
  return v
}

export function startStandaloneTimer(totalSec: number): void {
  const prev = _storeValue()
  const timer = createTimer(TIMER_ID, 250)
  const initialElapsed = prev?.totalSec === totalSec ? prev.totalSec - prev.remainingSec : 0

  timer.start(
    totalSec,
    (data) => {
      standaloneTimer.set({
        totalSec,
        remainingSec: data.remainingSec,
        isRunning: true
      })
    },
    () => {
      // 时间到
      standaloneTimer.set({
        totalSec,
        remainingSec: 0,
        isRunning: false
      })
    },
    initialElapsed
  )

  standaloneTimer.set({
    totalSec,
    remainingSec: totalSec - initialElapsed,
    isRunning: true
  })
}

export function pauseStandaloneTimer(): void {
  const timer = getTimer(TIMER_ID)
  timer?.stop()
  const prev = _storeValue()
  if (prev) {
    standaloneTimer.set({ ...prev, isRunning: false })
  }
}

export function resetStandaloneTimer(): void {
  const timer = getTimer(TIMER_ID)
  timer?.stop()
  standaloneTimer.set(null)
}
