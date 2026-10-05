import { createAuthClient } from "@vetoexpress/auth"

export { AuthError } from "@vetoexpress/auth"
export type { AuthUser as PlatformUser } from "@vetoexpress/auth"

const authClient = createAuthClient({
  apiBaseUrl: process.env.NEXT_PUBLIC_API_URL ?? "",
})

export const {
  login,
  register,
  sendVerificationCode,
  verifyCode,
  forgotPassword,
  resetPassword,
  fetchMe,
  readCachedUser,
} = authClient
