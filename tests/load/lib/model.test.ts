import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  credentialFor,
  marker,
  markerTime,
  reconnectDelay,
  RefreshQueue,
  ObservationTimes,
  verificationFileType
} from './model'

afterEach(() => vi.useRealTimers())
describe('load session behavior', () => {
  it('keeps first-read latency independent of delayed verification and records each state', () => {
    const times = new ObservationTimes()
    times.remember('file-1', 'submitted', 100)
    times.remember('file-1', 'published', 200)
    times.remember('file-1', 'published', 9000)
    expect(times.get('file-1')).toBe(100)
    expect(times.get('file-1', 'published')).toBe(200)
  })
  it('bounds observed history for long-running tests', () => {
    const times = new ObservationTimes(4)
    times.remember('old', 'published', 100)
    times.remember('middle', 'published', 200)
    times.remember('new', 'published', 300)
    expect(times.get('old')).toBeUndefined()
    expect(times.get('new', 'published')).toBe(300)
  })
  it('verifies more than 200 files through bounded groups without invalid Unicode labels', () => {
    const types = Array.from({ length: 201 }, (_, sequence) =>
      verificationFileType('😀'.repeat(30), 'a'.repeat(64), 10000, sequence)
    )
    const counts = types.reduce(
      (map, type) => map.set(type, (map.get(type) ?? 0) + 1),
      new Map<string, number>()
    )
    expect([...counts.values()]).toEqual([100, 100, 1])
    expect(types.every((type) => type.length <= 60)).toBe(true)
    expect(() => types.forEach((type) => encodeURIComponent(type))).not.toThrow()
  })
  it('fails rather than reusing a seat when concurrency exceeds the dataset', () => {
    const seats = [{ inviteCode: 'AAAA-BBBB-CCCC', password: 'test' }]
    expect(credentialFor(seats, 1)).toBe(seats[0])
    expect(() => credentialFor(seats, 2)).toThrow('INSUFFICIENT_CREDENTIALS')
  })
  it('recognizes only content created by this run', () => {
    const text = marker('run-1', 2, 8, 1000)
    expect(markerTime({ id: '1', title: text }, 'run-1')).toBe(1000)
    expect(markerTime({ id: '1', title: text }, 'another')).toBeNull()
    expect(markerTime({ id: '1', title: 'veto-load:run-1:broken' }, 'run-1')).toBeNull()
    expect(reconnectDelay(0, 0)).toBe(1000)
    expect(reconnectDelay(100, 0.5)).toBe(60_500)
  })
  it('merges bursts, serializes slow reads, and preserves changes during a read', async () => {
    vi.useFakeTimers()
    let release: () => void = () => {}
    const refresh = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve
          })
      )
      .mockResolvedValue(undefined)
    const queue = new RefreshQueue(refresh, vi.fn())
    queue.invalidate(['files'])
    queue.invalidate(['news'])
    await vi.advanceTimersByTimeAsync(250)
    expect(refresh).toHaveBeenCalledExactlyOnceWith(['files', 'news'])
    queue.invalidate(['directives'])
    await vi.advanceTimersByTimeAsync(1000)
    expect(refresh).toHaveBeenCalledTimes(1)
    release()
    await vi.advanceTimersByTimeAsync(250)
    expect(refresh).toHaveBeenLastCalledWith(['directives'])
    await queue.close()
  })
  it('defers background reads, recovers after a failed read, and cancels closed work', async () => {
    vi.useFakeTimers()
    const error = vi.fn()
    const refresh = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue(undefined)
    const queue = new RefreshQueue(refresh, error)
    queue.setVisible(false)
    queue.invalidate(['files'])
    await vi.advanceTimersByTimeAsync(1000)
    expect(refresh).not.toHaveBeenCalled()
    queue.setVisible(true)
    await vi.advanceTimersByTimeAsync(250)
    expect(error).toHaveBeenCalledTimes(1)
    queue.invalidate(['news'])
    await vi.advanceTimersByTimeAsync(250)
    expect(refresh).toHaveBeenCalledTimes(2)
    queue.invalidate(['files'])
    await queue.close()
    await vi.advanceTimersByTimeAsync(500)
    expect(refresh).toHaveBeenCalledTimes(2)
  })
})
