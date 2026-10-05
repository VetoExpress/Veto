import { AuthError } from "@vetoexpress/auth"
import type {
  AccountResult,
  AccountTokenResult,
  DesktopAccountAPI,
} from "@vetoexpress/auth/desktop"
import { clearApiCache } from "./api-cache"

export function desktopAccount(): DesktopAccountAPI | undefined {
  if (typeof window === "undefined") return undefined
  const api = (window as Window & { veto?: { account?: DesktopAccountAPI } })
    .veto?.account
  return typeof api?.getAccessToken === "function" &&
    typeof api?.adoptToken === "function"
    ? api
    : undefined
}

export function requireAccountResult<
  T extends AccountResult | AccountTokenResult,
>(result: T): Extract<T, { ok: true }> {
  if (!result.ok) throw new AuthError(result.error, result.status)
  return result as Extract<T, { ok: true }>
}

// Multiple page/titlebar hooks share one migration, including under StrictMode.
const initialized = new WeakMap<DesktopAccountAPI, Promise<void>>()
async function initialize(api: DesktopAccountAPI) {
  let pending = initialized.get(api)
  if (!pending) {
    pending = (async () => {
      const current = requireAccountResult(await api.getAccessToken())
      const legacy = localStorage.getItem("veto_token")
      if (!current.token && legacy) {
        const result = await api.adoptToken(legacy, true)
        if (!result.ok && result.status !== 401) requireAccountResult(result)
      }
      localStorage.removeItem("veto_token")
    })()
    initialized.set(api, pending)
    void pending.catch(() => initialized.delete(api))
  }
  await pending
}

export async function readPlatformSession() {
  const api = desktopAccount()
  if (!api) return { token: localStorage.getItem("veto_token") ?? undefined }
  await initialize(api)
  const result = requireAccountResult(await api.getAccessToken())
  return { token: result.token ?? undefined }
}

export function saveWebToken(token: string) {
  // Desktop credentials are owned by Electron and only kept in page memory.
  if (!desktopAccount()) localStorage.setItem("veto_token", token)
}

export async function signOutPlatform(expectedToken?: string) {
  const api = desktopAccount()
  if (api) requireAccountResult(await api.signOut(expectedToken))
  else localStorage.removeItem("veto_token")
  clearApiCache()
}
