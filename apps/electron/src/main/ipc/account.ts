import { app, ipcMain, webContents } from 'electron'
import { is } from '@electron-toolkit/utils'
import { AuthError, createAuthClient, type AccountUpdate } from '@vetoexpress/auth'
import type { AccountResult, AccountSnapshot, AccountTokenResult } from '@vetoexpress/auth/desktop'
import { createAccountSession, type AccountSession } from '../account-session'
import { createAccountStorage } from '../account-storage'
import { isAccountOrigin, isTrustedAppFrame as trusted } from './trusted-origin'
import { t, onLocaleChanged } from '../i18n'
import { LocalizedAccountError, accountErrorMessage } from '../account-i18n'
import { createLogger } from '../logger'

export { isAccountOrigin } from './trusted-origin'
const log = createLogger('IpcAccount')
let unsubscribeLocale: (() => void) | undefined

function broadcast(snapshot: AccountSnapshot) {
  for (const contents of webContents.getAllWebContents()) {
    if (contents.isDestroyed()) continue
    try {
      if (isAccountOrigin(contents.mainFrame.origin, is.dev)) {
        contents.send('veto:account:changed', snapshot)
      }
    } catch (error) {
      log.warn(
        'Failed to broadcast account state; remaining renderers will still be notified',
        { webContentsId: contents.id },
        error
      )
    }
  }
}

export function registerAccountIpc(session?: AccountSession): void {
  const account =
    session ??
    createAccountSession(
      createAuthClient({
        apiBaseUrl: __VETO_ACCOUNT_API_URL__,
        fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) })
      }),
      createAccountStorage(app.getPath('userData')),
      broadcast
    )
  unsubscribeLocale?.()
  unsubscribeLocale = onLocaleChanged(() => {
    broadcast(account.getSnapshot())
  })
  const handle = (channel: string, operation: (...args: unknown[]) => Promise<AccountSnapshot>) => {
    ipcMain.handle(channel, async (event, ...args): Promise<AccountResult> => {
      if (!trusted(event)) return { ok: false, error: t('electron_account_access_denied') }
      try {
        return { ok: true, session: await operation(...args) }
      } catch (error) {
        log.warn('Account IPC operation failed', {
          channel,
          errorType: error instanceof Error ? error.name : typeof error,
          status: error instanceof AuthError ? error.status : undefined
        })
        return {
          ok: false,
          error:
            error instanceof AuthError
              ? accountErrorMessage(error)
              : t('electron_account_operation_failed'),
          status: error instanceof AuthError ? error.status : undefined
        }
      }
    })
  }
  handle('veto:account:get-session', () => account.getSession())
  handle('veto:account:refresh', () => account.refresh())
  handle('veto:account:send-password-code', () => account.sendPasswordCode())
  handle('veto:account:reset-password', (code, password) => {
    if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim()))
      throw new LocalizedAccountError('electron_account_invalid_code')
    if (typeof password !== 'string' || password.length < 6 || password.length > 1024)
      throw new LocalizedAccountError('electron_account_invalid_password')
    return account.resetPassword(code.trim(), password)
  })
  handle('veto:account:update-profile', (update) => {
    if (!update || typeof update !== 'object' || Array.isArray(update))
      throw new LocalizedAccountError('electron_account_invalid_profile')
    const body = update as Record<string, unknown>
    if (
      !Object.keys(body).length ||
      Object.keys(body).some((key) => !['name', 'avatar'].includes(key))
    )
      throw new LocalizedAccountError('electron_account_invalid_profile')
    if (
      body.name !== undefined &&
      (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 200)
    )
      throw new LocalizedAccountError('electron_account_invalid_name')
    if (
      body.avatar !== undefined &&
      (typeof body.avatar !== 'string' || body.avatar.length > 699052)
    )
      throw new LocalizedAccountError('electron_account_invalid_avatar')
    return account.updateProfile(body as AccountUpdate)
  })
  handle('veto:account:sign-out', (expectedToken) => {
    if (expectedToken !== undefined && typeof expectedToken !== 'string')
      throw new LocalizedAccountError('electron_account_invalid_credentials')
    return account.signOut(expectedToken)
  })
  ipcMain.handle('veto:account:get-access-token', async (event): Promise<AccountTokenResult> => {
    if (!trusted(event)) return { ok: false, error: t('electron_account_access_denied') }
    try {
      return { ok: true, ...(await account.getAccessToken()) }
    } catch (error) {
      log.warn('Failed to read account token; renderer receives no credentials', {
        errorType: error instanceof Error ? error.name : typeof error
      })
      return { ok: false, error: t('electron_account_session_unavailable') }
    }
  })
  handle('veto:account:adopt-token', (token, onlyIfSignedOut) => {
    if (
      typeof token !== 'string' ||
      !token ||
      token.length > 8192 ||
      (onlyIfSignedOut !== undefined && typeof onlyIfSignedOut !== 'boolean')
    )
      throw new LocalizedAccountError('electron_account_invalid_credentials')
    return account.adoptToken(token, onlyIfSignedOut)
  })
  handle('veto:account:login', (email, password) => {
    if (
      typeof email !== 'string' ||
      !email.trim() ||
      email.length > 320 ||
      typeof password !== 'string' ||
      !password ||
      password.length > 4096
    ) {
      throw new LocalizedAccountError('electron_account_login_required_fields')
    }
    return account.login(email, password)
  })
}
