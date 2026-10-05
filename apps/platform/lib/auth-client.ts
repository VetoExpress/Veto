import { AuthError, createAuthClient } from "@vetoexpress/auth"
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

export async function login(email: string, password: string): Promise<string> {
  const api = desktopAccount()
  if (!api) return authClient.login(email, password)
  requireAccountResult(await api.login(email, password))
  const { token } = requireAccountResult(await api.getAccessToken())
  if (!token) throw new AuthError("登录会话已失效，请重新登录")
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
