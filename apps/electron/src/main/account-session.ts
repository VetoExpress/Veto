import { AuthError, type AuthClient, type AuthUser } from '@vetoexpress/auth'
import type { AccountSnapshot } from '@vetoexpress/auth/desktop'

export interface StoredAccount {
  token: string
  user: AuthUser
}

export interface AccountStorage {
  load(): Promise<StoredAccount | null>
  /** Returns false when secure persistence is unavailable. */
  save(account: StoredAccount): Promise<boolean>
  clear(): Promise<void>
}

/** Owns account credentials; renderers only receive public user state. */
export function createAccountSession(
  client: Pick<AuthClient, 'login' | 'fetchMe'>,
  storage: AccountStorage,
  changed: (snapshot: AccountSnapshot) => void
) {
  let account: StoredAccount | null = null
  let snapshot: AccountSnapshot = { user: null, persistent: false, warning: null }
  let queue: Promise<unknown> = Promise.resolve()

  // Serialize restore, login, refresh and logout to prevent late requests resurrecting a session.
  function serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation)
    queue = result.catch(() => undefined)
    return result
  }

  function publish(persistent: boolean, warning: string | null = null) {
    snapshot = { user: account?.user ?? null, persistent, warning }
    changed(snapshot)
    return snapshot
  }

  async function check() {
    if (!account) return snapshot
    try {
      const user = await client.fetchMe(account.token)
      const updated = { token: account.token, user }
      const persistent = await storage.save(updated)
      account = updated
      return publish(
        persistent,
        persistent ? null : '当前设备无法安全保存登录状态，关闭应用后需重新登录。'
      )
    } catch (error) {
      if (error instanceof AuthError && error.status === 401) {
        await storage.clear()
        account = null
        return publish(false, '登录已失效，请重新登录。')
      }
      return publish(
        snapshot.persistent,
        error instanceof Error ? error.message : '暂时无法验证账号，请稍后重试。'
      )
    }
  }

  const restored = serial(async () => {
    try {
      account = await storage.load()
    } catch {
      await storage.clear()
      return publish(false, '无法恢复已保存的登录状态，请重新登录。')
    }
    if (!account) return snapshot
    publish(true)
    return check()
  })

  return {
    getSession: async () => {
      await restored
      await queue
      return snapshot
    },
    login: (email: string, password: string) =>
      serial(async () => {
        const token = await client.login(email.trim(), password)
        const user = await client.fetchMe(token)
        const next = { token, user }
        const persistent = await storage.save(next)
        account = next
        return publish(
          persistent,
          persistent ? null : '当前设备无法安全保存登录状态，关闭应用后需重新登录。'
        )
      }),
    refresh: () => serial(check),
    signOut: () =>
      serial(async () => {
        await storage.clear()
        account = null
        return publish(false)
      })
  }
}

export type AccountSession = ReturnType<typeof createAccountSession>
