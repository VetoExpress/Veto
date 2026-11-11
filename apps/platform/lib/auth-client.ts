import { message } from "@/i18n/messages"
import { AuthError, createAuthClient } from "@vetoexpress/auth"
import type { AccountUpdate } from "@vetoexpress/auth"
import { desktopAccount, requireAccountResult } from "./platform-session"

export { AuthError } from "@vetoexpress/auth"
export type { AuthUser as PlatformUser } from "@vetoexpress/auth"

const authClient = createAuthClient({
  apiBaseUrl: process.env.NEXT_PUBLIC_API_URL ?? "",
})

export const {
  sendVerificationCode,
  verifyCode,
  forgotPassword,
  resetPassword,
  fetchMe,
  readCachedUser,
} = authClient

function notifyProfileChanged() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("veto:account:changed"))
}

export async function updateAccountProfile(
  token: string,
  update: AccountUpdate
) {
  const api = desktopAccount()
  const user = api
    ? requireAccountResult(await api.updateProfile(update)).session.user
    : await authClient.patchMe(token, update)
  if (!user) throw new AuthError(message("platform_login_again"), 401)
  if (!api) notifyProfileChanged()
  return user
}

export async function refreshAccountProfile(token: string) {
  const api = desktopAccount()
  const user = api
    ? requireAccountResult(await api.refresh()).session.user
    : await authClient.fetchMe(token)
  if (!user) throw new AuthError(message("platform_login_again"), 401)
  if (!api) notifyProfileChanged()
  return user
}

export async function sendAccountPasswordCode(email: string) {
  const api = desktopAccount()
  if (api) requireAccountResult(await api.sendPasswordCode())
  else await authClient.forgotPassword(email)
}

export async function resetAccountPassword(
  email: string,
  code: string,
  password: string
) {
  const api = desktopAccount()
  if (api) requireAccountResult(await api.resetPassword(code, password))
  else await authClient.resetPassword(email, code, password)
}

export async function login(email: string, password: string): Promise<string> {
  const api = desktopAccount()
  if (!api) return authClient.login(email, password)
  requireAccountResult(await api.login(email, password))
  const { token } = requireAccountResult(await api.getAccessToken())
  if (!token) throw new AuthError(message("platform_session_expired"))
  return token
}

export async function register(
  ...args: Parameters<typeof authClient.register>
): Promise<string> {
  const token = await authClient.register(...args)
  const api = desktopAccount()
  if (api) requireAccountResult(await api.adoptToken(token))
  return token
}
