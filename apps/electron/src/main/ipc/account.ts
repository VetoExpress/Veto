import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { is } from '@electron-toolkit/utils'
import { AuthError, createAuthClient } from '@vetoexpress/auth'
import type { AccountResult, AccountSnapshot } from '@vetoexpress/auth/desktop'
import { createAccountSession, type AccountSession } from '../account-session'
import { createAccountStorage } from '../account-storage'

export function isAccountOrigin(origin: string, development: boolean): boolean {
  return origin === 'veto://app' || (development && origin === 'http://localhost:5173')
}

function trusted(event: IpcMainInvokeEvent) {
  const frame = event.senderFrame
  return !!frame && frame === event.sender.mainFrame && isAccountOrigin(frame.origin, is.dev)
}

function broadcast(snapshot: AccountSnapshot) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (isAccountOrigin(window.webContents.mainFrame.origin, is.dev)) {
      window.webContents.send('veto:account:changed', snapshot)
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
  const handle = (channel: string, operation: (...args: unknown[]) => Promise<AccountSnapshot>) => {
    ipcMain.handle(channel, async (event, ...args): Promise<AccountResult> => {
      if (!trusted(event)) return { ok: false, error: '此页面无法访问桌面账号。' }
      try {
        return { ok: true, session: await operation(...args) }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof AuthError ? error.message : '账号操作失败，请稍后重试。',
          status: error instanceof AuthError ? error.status : undefined
        }
      }
    })
  }
  handle('veto:account:get-session', () => account.getSession())
  handle('veto:account:refresh', () => account.refresh())
  handle('veto:account:sign-out', () => account.signOut())
  handle('veto:account:login', (email, password) => {
    if (
      typeof email !== 'string' ||
      !email.trim() ||
      email.length > 320 ||
      typeof password !== 'string' ||
      !password ||
      password.length > 4096
    ) {
      throw new AuthError('请填写邮箱和密码')
    }
    return account.login(email, password)
  })
}
