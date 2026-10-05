import type { AuthUser, AccountUpdate } from './index'

/** Public account state. Credentials never travel with state notifications. */
export interface AccountSnapshot {
  user: AuthUser | null
  persistent: boolean
  warning: string | null
}

export type AccountResult =
  { ok: true; session: AccountSnapshot } | { ok: false; error: string; status?: number }

/** Only returned by an explicit request from a trusted application frame. */
export type AccountTokenResult =
  | { ok: true; session: AccountSnapshot; token: string | null }
  | { ok: false; error: string; status?: number }

export interface DesktopAccountAPI {
  getSession(): Promise<AccountResult>
  login(email: string, password: string): Promise<AccountResult>
  getAccessToken(): Promise<AccountTokenResult>
  adoptToken(token: string, onlyIfSignedOut?: boolean): Promise<AccountResult>
  refresh(): Promise<AccountResult>
  updateProfile(update: AccountUpdate): Promise<AccountResult>
  signOut(expectedToken?: string): Promise<AccountResult>
  onChanged(callback: (session: AccountSnapshot) => void): () => void
}
