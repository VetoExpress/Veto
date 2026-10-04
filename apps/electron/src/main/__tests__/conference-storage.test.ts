import { beforeEach, describe, expect, it, vi } from 'vitest'
const disk = vi.hoisted(() => ({ files: new Map<string, string>(), failRename: false }))
vi.mock('electron', () => ({ app: { getPath: () => 'test-app-data' } }))
vi.mock('../logger')
vi.mock('fs', () => ({
  existsSync: (path: string) => disk.files.has(path),
  mkdirSync: vi.fn(),
  readFileSync: (path: string) => disk.files.get(path),
  writeFileSync: (path: string, value: string) => { disk.files.set(path, value) },
  renameSync: (from: string, to: string) => { if (disk.failRename) throw new Error('磁盘不可写'); disk.files.set(to, disk.files.get(from)!); disk.files.delete(from) },
}))
import { loadStore, saveStore } from '../data/store'
describe('会议文件保存', () => {
  beforeEach(() => { disk.files.clear(); disk.failRename = false })
  it('keeps the previous valid file if replacement fails', () => {
    saveStore('conferences', [{ phase: 'voting' }])
    disk.failRename = true
    expect(() => saveStore('conferences', [{ phase: 'closed' }])).toThrow('磁盘不可写')
    expect(loadStore('conferences')).toEqual([{ phase: 'voting' }])
  })
  it('reports corrupt conference files rather than returning an empty conference list', () => {
    saveStore('conferences', [])
    const path = [...disk.files.keys()][0]
    disk.files.set(path, '{broken')
    expect(() => loadStore('conferences')).toThrow()
    expect(disk.files.get(path)).toBe('{broken')
  })
})
