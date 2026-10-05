import { afterEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { encryption } = vi.hoisted(() => ({ encryption: { available: true } }))
vi.mock('electron', () => ({
  safeStorage: {
    isAsyncEncryptionAvailable: async () => encryption.available,
    getSelectedStorageBackend: () => 'gnome_libsecret',
    encryptStringAsync: async (text: string) => Buffer.from(Buffer.from(text).toString('base64')),
    decryptStringAsync: async (bytes: Buffer) => ({
      result: Buffer.from(bytes.toString(), 'base64').toString()
    })
  }
}))
import { createAccountStorage } from '../account-storage'

const directories: string[] = []
const account = {
  token: 'secret-token',
  user: { name: '用户', email: 'test@example.test', avatar: '', organization: '模联' }
}
afterEach(async () => {
  encryption.available = true
  await Promise.all(
    directories.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true }))
  )
})
async function setup() {
  const directory = await fs.mkdtemp(join(tmpdir(), 'veto-account-test-'))
  directories.push(directory)
  return { directory, storage: createAccountStorage(directory) }
}
describe('account credential storage', () => {
  it('writes encrypted bytes, restores them, replaces the file and deletes credentials on logout', async () => {
    const { directory, storage } = await setup()
    expect(await storage.load()).toBeNull()
    expect(await storage.save(account)).toBe(true)
    const bytes = await fs.readFile(join(directory, 'account-session.enc'))
    expect(bytes.toString()).not.toContain(account.token)
    expect(await storage.load()).toEqual(account)
    await storage.save({ ...account, token: 'new-token' })
    expect((await storage.load())?.token).toBe('new-token')
    await storage.clear()
    expect(await fs.readdir(directory)).toEqual([])
  })
  it('never writes plaintext or retains old credentials when secure storage is unavailable', async () => {
    const { directory, storage } = await setup()
    await storage.save(account)
    encryption.available = false
    expect(await storage.save(account)).toBe(false)
    expect(await fs.readdir(directory)).toEqual([])
  })
  it('rejects damaged or invalid saved account data', async () => {
    const { directory, storage } = await setup()
    await fs.writeFile(
      join(directory, 'account-session.enc'),
      Buffer.from(JSON.stringify({ token: 'token' })).toString('base64')
    )
    await expect(storage.load()).rejects.toThrow('账号存储损坏')
  })
})
