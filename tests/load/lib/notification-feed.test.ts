import { describe, expect, it, vi } from 'vitest'
import { NotificationFeed } from './notification-feed'

describe('notification cursor', () => {
  it('shares simultaneous reads and uses the committed cursor for the next read', async () => {
    let finish!: (result: Record<string, unknown>) => void
    const read = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          })
      )
      .mockResolvedValue({ notifications: [], nextCursor: 3 })
    const feed = new NotificationFeed(read, () => true)
    const first = feed.sync()
    const second = feed.sync()
    expect(first).toBe(second)
    expect(read).toHaveBeenCalledOnce()
    finish({ notifications: [{ id: 3 }], nextCursor: 3 })
    await Promise.all([first, second])
    await feed.sync()
    expect(read.mock.calls.map(([cursor]) => cursor)).toEqual([0, 3])
  })
  it('keeps its cursor after a failed page and retries without skipping events', async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce({ notifications: Array(200).fill({ id: 1 }), nextCursor: 200 })
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue({ notifications: [], nextCursor: 200 })
    const feed = new NotificationFeed(read, () => true)
    await expect(feed.sync()).rejects.toThrow('network')
    await feed.sync()
    expect(read.mock.calls.map(([cursor]) => cursor)).toEqual([0, 200, 200])
  })
  it('rejects a non-advancing nonempty page instead of looping', async () => {
    const feed = new NotificationFeed(
      async () => ({ notifications: [{ id: 1 }], nextCursor: 0 }),
      () => true
    )
    await expect(feed.sync()).rejects.toThrow('cursor_not_advancing')
  })
})
