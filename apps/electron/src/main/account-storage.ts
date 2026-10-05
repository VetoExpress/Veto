import { safeStorage } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { AccountStorage, StoredAccount } from './account-session'

function isStoredAccount(value: unknown): value is StoredAccount {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<StoredAccount>
  return (
    typeof record.token === 'string' &&
    record.token.length > 0 &&
    !!record.user &&
    ['name', 'email', 'avatar', 'organization'].every(
      (key) => typeof record.user![key as keyof StoredAccount['user']] === 'string'
    )
  )
}

export function createAccountStorage(userDataPath: string): AccountStorage {
  const file = join(userDataPath, 'account-session.enc')
  async function available() {
    return (
      (await safeStorage.isAsyncEncryptionAvailable()) &&
      !(process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')
    )
  }
  return {
    async load() {
      let encrypted: Buffer
      try {
        encrypted = await fs.readFile(file)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw error
      }
      if (!(await available())) throw new Error('安全存储不可用')
      const { result } = await safeStorage.decryptStringAsync(encrypted)
      const account: unknown = JSON.parse(result)
      if (!isStoredAccount(account)) throw new Error('账号存储损坏')
      return account
    },
    async save(account) {
      if (!(await available())) {
        await fs.rm(file, { force: true })
        return false
      }
      const encrypted = await safeStorage.encryptStringAsync(JSON.stringify(account))
      await fs.mkdir(userDataPath, { recursive: true })
      const temporary = `${file}.tmp`
      try {
        await fs.writeFile(temporary, encrypted, { mode: 0o600 })
        await fs.rename(temporary, file)
      } finally {
        await fs.rm(temporary, { force: true })
      }
      return true
    },
    async clear() {
      await fs.rm(file, { force: true })
      await fs.rm(`${file}.tmp`, { force: true })
    }
  }
}
