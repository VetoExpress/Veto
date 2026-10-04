import { describe, expect, it, vi } from 'vitest'
import { get } from 'svelte/store'
import { createConferenceSaver } from './conference-save'

describe('会议保存状态', () => {
  it('reports failures and allows a later retry', async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error('磁盘空间不足')).mockResolvedValue(undefined)
    const saver = createConferenceSaver(write)
    expect(await saver.save({ phase: 'voting' })).toBe(false)
    expect(get(saver.status)).toMatchObject({ state: 'error', error: '磁盘空间不足' })
    expect(await saver.save({ phase: 'voting' })).toBe(true)
    expect(get(saver.status).state).toBe('saved')
  })
  it('serializes saves and captures the state at the moment save was requested', async () => {
    let release!: () => void
    const writes: unknown[] = []
    const saver = createConferenceSaver(async (data) => { writes.push(data); if (writes.length === 1) await new Promise<void>((resolve) => { release = resolve }) })
    const data = { elapsed: 4 }
    const first = saver.save(data)
    await Promise.resolve()
    data.elapsed = 8
    const second = saver.save(data)
    data.elapsed = 12
    expect(writes).toEqual([{ elapsed: 4 }])
    release()
    await Promise.all([first, second])
    expect(writes).toEqual([{ elapsed: 4 }, { elapsed: 8 }])
  })
})
