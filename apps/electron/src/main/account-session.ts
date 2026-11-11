import { AuthError, type AuthClient, type AuthUser, type AccountUpdate } from '@vetoexpress/auth'
import type { AccountSnapshot } from '@vetoexpress/auth/desktop'
import { t } from './i18n'
import { accountErrorKey, LocalizedAccountError } from './account-i18n'
import { createLogger } from './logger'

const log = createLogger('AccountSession')

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
  client: Pick<AuthClient, 'login' | 'fetchMe' | 'patchMe' | 'forgotPassword' | 'resetPassword'>,
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

  function publish(
    persistent: boolean,
    warningKey: Parameters<typeof t>[0] | null = null,
    warningText: string | null = null
  ) {
    if (warningKey)
      log.warn('Account state requires user attention', {
        warningKey,
        persistent,
        signedIn: !!account
      })
    snapshot = {
      user: account?.user ?? null,
      persistent,
      get warning() {
        return warningKey ? t(warningKey) : warningText
      }
    }
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
      return publish(persistent, persistent ? null : 'electron_account_persistence_unavailable')
    } catch (error) {
      log.warn(
        'Account verification failed; retaining cached state unless credentials were rejected',
        {
          errorType: error instanceof Error ? error.name : typeof error,
          status: error instanceof AuthError ? error.status : undefined
        }
      )
      if (error instanceof AuthError && error.status === 401) {
        await storage.clear()
        account = null
        return publish(false, 'electron_account_expired')
      }
      return publish(
        snapshot.persistent,
        accountErrorKey(error) ??
          (error instanceof Error ? null : 'electron_account_verification_unavailable'),
        error instanceof Error ? error.message : null
      )
    }
  }

  const restored = serial(async () => {
    try {
      account = await storage.load()
    } catch (error) {
      log.warn('Failed to restore account; clearing saved credentials', {
        errorType: error instanceof Error ? error.name : typeof error
      })
      try {
        await storage.clear()
      } catch (clearError) {
        log.warn('Failed to remove unreadable saved account; continuing signed out', {
          errorType: clearError instanceof Error ? clearError.name : typeof clearError
        })
      }
      return publish(false, 'electron_account_restore_failed')
    }
    if (!account) return snapshot
    publish(true)
    return check()
  })

  return {
    getSnapshot: (): AccountSnapshot => ({ ...snapshot }),
    getAccessToken: () =>
      serial(async () => ({ session: snapshot, token: account?.token ?? null })),
    adoptToken: (token: string, onlyIfSignedOut = false) =>
      serial(async () => {
        if (onlyIfSignedOut && account) return snapshot
        const user = await client.fetchMe(token)
        const next = { token, user }
        const persistent = await storage.save(next)
        account = next
        return publish(persistent, persistent ? null : 'electron_account_persistence_unavailable')
      }),
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
        return publish(persistent, persistent ? null : 'electron_account_persistence_unavailable')
      }),
    refresh: () => serial(check),
    sendPasswordCode: () =>
      serial(async () => {
        if (!account) throw new LocalizedAccountError('electron_account_sign_in_required', 401)
        await client.forgotPassword(account.user.email)
        return snapshot
      }),
    resetPassword: (code: string, password: string) =>
      serial(async () => {
        if (!account) throw new LocalizedAccountError('electron_account_sign_in_required', 401)
        await client.resetPassword(account.user.email, code, password)
        // Password recovery revokes every server session, including this device.
        account = null
        try {
          await storage.clear()
        } catch (error) {
          log.warn(
            'Failed to clear saved credentials after password reset; server session is already revoked',
            { errorType: error instanceof Error ? error.name : typeof error }
          )
        }
        return publish(false, 'electron_account_password_reset')
      }),
    updateProfile: (update: AccountUpdate) =>
      serial(async () => {
        if (!account) throw new LocalizedAccountError('electron_account_sign_in_required', 401)
        let user: AuthUser
        try {
          user = await client.patchMe(account.token, update)
        } catch (error) {
          if (error instanceof AuthError && error.status === 401) {
            await storage.clear()
            account = null
            publish(false, 'electron_account_expired')
          }
          throw error
        }
        account = { token: account.token, user }
        // The server has already saved the change; keep the new state even if local persistence fails.
        let persistent = false
        try {
          persistent = await storage.save(account)
        } catch (error) {
          log.warn('Failed to save updated account; preserving live session', {
            errorType: error instanceof Error ? error.name : typeof error
          })
        }
        return publish(persistent, persistent ? null : 'electron_account_updated_not_saved')
      }),
    signOut: (expectedToken?: string) =>
      serial(async () => {
        // A late 401 from the previous account must not sign out the new account.
        if (expectedToken !== undefined && expectedToken !== account?.token) return snapshot
        await storage.clear()
        account = null
        return publish(false)
      })
  }
}

export type AccountSession = ReturnType<typeof createAccountSession>
