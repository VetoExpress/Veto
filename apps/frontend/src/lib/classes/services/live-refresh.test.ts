import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveRefresh } from './live-refresh'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('live refresh', () => {
  it('coalesces bursts and refreshes only subscribed resources', async () => {
    const live = new LiveRefresh()
    const news = vi.fn()
    const files = vi.fn()
    live.subscribe(['news', 'timeline'], news)
    live.subscribe(['files'], files)
    live.invalidate(['news'])
    live.invalidate(['timeline'])
    live.invalidate(['news'])
    await vi.advanceTimersByTimeAsync(250)
    expect(news).toHaveBeenCalledTimes(1)
    expect(files).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(news).toHaveBeenCalledTimes(1)
  })

  it('retains notifications received during an in-flight read without overlapping reads', async () => {
    const live = new LiveRefresh()
    let finish!: () => void
    const refresh = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
    live.subscribe(['news'], refresh)
    live.invalidate(['news'])
    await vi.advanceTimersByTimeAsync(250)
    live.invalidate(['news'])
    await vi.advanceTimersByTimeAsync(1000)
    expect(refresh).toHaveBeenCalledTimes(1)
    finish()
    await vi.advanceTimersByTimeAsync(250)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('defers hidden-window refreshes and discards work for unmounted pages', async () => {
    const live = new LiveRefresh()
    const refresh = vi.fn()
    const unsubscribe = live.subscribe(['files'], refresh)
    live.setVisible(false)
    live.invalidate(['files'])
    await vi.advanceTimersByTimeAsync(1000)
    expect(refresh).not.toHaveBeenCalled()
    live.setVisible(true)
    await vi.advanceTimersByTimeAsync(250)
    expect(refresh).toHaveBeenCalledTimes(1)
    live.invalidate(['files'])
    unsubscribe()
    await vi.advanceTimersByTimeAsync(250)
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
