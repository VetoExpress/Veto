import { describe, expect, it } from 'vitest'
import { OnlineWindow } from './online-window'

describe('shared online acceptance interval', () => {
  it('requires every seat to cover one common interval, not cumulative connections', () => {
    const windows = Array.from({ length: 500 }, () => new OnlineWindow(1000, 2000))
    windows.forEach((window, index) => window.update(true, 100 + index))
    expect(windows.filter((window) => window.complete(2000))).toHaveLength(500)
    const late = new OnlineWindow(1000, 2000)
    late.update(true, 1001)
    expect(late.complete(2000)).toBe(false)
  })
  it('rejects brief disconnects even when a seat reconnects before the next poll', () => {
    const window = new OnlineWindow(1000, 2000)
    window.update(true, 500)
    window.update(false, 1200)
    window.update(true, 1201)
    expect(window.complete(2100)).toBe(false)
  })
  it('rejects never-ready, early exit and disconnected-at-start sessions', () => {
    expect(new OnlineWindow(1000, 2000).complete(2100)).toBe(false)
    const early = new OnlineWindow(1000, 2000)
    early.update(true, 500)
    expect(early.complete(1999)).toBe(false)
    const offline = new OnlineWindow(1000, 2000)
    offline.update(true, 500)
    offline.update(false, 900)
    offline.update(true, 1100)
    expect(offline.complete(2100)).toBe(false)
  })
  it('allows recovery before start and closing at or after the end', () => {
    const window = new OnlineWindow(1000, 2000)
    window.update(true, 100)
    window.update(false, 200)
    window.update(true, 1000)
    window.update(false, 2000)
    expect(window.complete(2100)).toBe(true)
  })
})
