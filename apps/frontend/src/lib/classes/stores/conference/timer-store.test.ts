import { afterEach, describe, expect, it, vi } from 'vitest'
import { get } from 'svelte/store'
import { destroyAllTimers } from '$lib/classes/services/timer/timer'
import { pauseStandaloneTimer, resetStandaloneTimer, standaloneTimer, startStandaloneTimer } from './timer-store'

afterEach(() => {
  resetStandaloneTimer()
  destroyAllTimers()
  vi.useRealTimers()
})

describe('standalone timer', () => {
  it('starts a new 10-minute countdown without carrying over elapsed time from another duration', () => {
    standaloneTimer.set({ totalSec: 300, remainingSec: 0, isRunning: false })
    startStandaloneTimer(600)
    expect(get(standaloneTimer)).toEqual({ totalSec: 600, remainingSec: 600, isRunning: true })
  })

  it('preserves elapsed time when resuming the same duration', () => {
    standaloneTimer.set({ totalSec: 600, remainingSec: 300, isRunning: false })
    startStandaloneTimer(600)
    expect(get(standaloneTimer)?.remainingSec).toBe(300)
  })

  it('clears a paused countdown so selecting a new preset starts at its full duration', () => {
    startStandaloneTimer(300)
    pauseStandaloneTimer()
    resetStandaloneTimer()
    expect(get(standaloneTimer)).toBeNull()
    startStandaloneTimer(600)
    expect(get(standaloneTimer)?.remainingSec).toBe(600)
  })
})
