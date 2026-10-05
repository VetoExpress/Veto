import type { AuthUser } from './index'

/** Public account state. Credentials never travel with state notifications. */
export interface AccountSnapshot {
  user: AuthUser | null
  persistent: boolean
  warning: string | null
}

export type AccountResult =
  { ok: true; session: AccountSnapshot } | { ok: false; error: string; status?: number }

export interface DesktopAccountAPI {
  getSession(): Promise<AccountResult>
  login(email: string, password: string): Promise<AccountResult>
  refresh(): Promise<AccountResult>
  signOut(): Promise<AccountResult>
  onChanged(callback: (session: AccountSnapshot) => void): () => void
}
