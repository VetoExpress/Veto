import { afterEach, describe, expect, it, vi } from "vitest"
import type {
  DesktopAccountAPI,
  AccountSnapshot,
} from "@vetoexpress/auth/desktop"
import {
  readPlatformSession,
  saveWebToken,
  signOutPlatform,
} from "./platform-session"

const user = {
  name: "用户",
  email: "test@example.test",
  avatar: "",
  organization: "模联",
}
function setup(token: string | null, legacy: string | null = null) {
  const values = new Map<string, string>()
  if (legacy) values.set("veto_token", legacy)
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
  const snapshot = (): AccountSnapshot => ({
    user: token ? user : null,
    persistent: !!token,
    warning: null,
  })
  const api: DesktopAccountAPI = {
    getAccessToken: vi.fn(async () => ({
      ok: true as const,
      token,
      session: snapshot(),
    })),
    getSession: vi.fn(),
    login: vi.fn(),
    refresh: vi.fn(),
    updateProfile: vi.fn(),
    onChanged: vi.fn(),
    adoptToken: vi.fn(async (next) => {
      token = next
      return { ok: true as const, session: snapshot() }
    }),
    signOut: vi.fn(async (expected) => {
      if (expected === undefined || token === expected) token = null
      return { ok: true as const, session: snapshot() }
    }),
  }
  vi.stubGlobal("window", { veto: { account: api } })
  vi.stubGlobal("localStorage", storage)
  return { api, values }
}
afterEach(() => vi.unstubAllGlobals())
describe("platform desktop session adapter", () => {
  it("prioritizes desktop credentials and removes old browser credentials", async () => {
    const { api, values } = setup("desktop-token", "legacy-token")
    expect(await readPlatformSession()).toEqual({ token: "desktop-token" })
    expect(api.adoptToken).not.toHaveBeenCalled()
    expect(values.has("veto_token")).toBe(false)
    saveWebToken("desktop-token")
    expect(values.has("veto_token")).toBe(false)
  })
  it("validates and migrates legacy credentials only once across concurrent readers", async () => {
    const { api, values } = setup(null, "legacy-token")
    const sessions = await Promise.all([
      readPlatformSession(),
      readPlatformSession(),
    ])
    expect(sessions).toEqual([
      { token: "legacy-token" },
      { token: "legacy-token" },
    ])
    expect(api.adoptToken).toHaveBeenCalledExactlyOnceWith("legacy-token", true)
    expect(values.has("veto_token")).toBe(false)
  })
  it("discards rejected legacy credentials but preserves them on temporary service failures", async () => {
    let test = setup(null, "expired-token")
    vi.mocked(test.api.adoptToken).mockResolvedValueOnce({
      ok: false,
      error: "expired",
      status: 401,
    })
    expect(await readPlatformSession()).toEqual({ token: undefined })
    expect(test.values.has("veto_token")).toBe(false)
    test = setup(null, "legacy-token")
    vi.mocked(test.api.adoptToken).mockResolvedValueOnce({
      ok: false,
      error: "offline",
    })
    await expect(readPlatformSession()).rejects.toThrow("offline")
    expect(test.values.get("veto_token")).toBe("legacy-token")
    expect((await readPlatformSession()).token).toBe("legacy-token")
  })
  it("signs out through Electron and protects a newer account from an old credential", async () => {
    const { api } = setup("new-token")
    await signOutPlatform("old-token")
    expect((await readPlatformSession()).token).toBe("new-token")
    await signOutPlatform("new-token")
    expect((await readPlatformSession()).token).toBeUndefined()
    expect(api.signOut).toHaveBeenLastCalledWith("new-token")
  })
  it("keeps standalone browser token persistence and logout", async () => {
    const { values } = setup(null)
    vi.stubGlobal("window", {})
    saveWebToken("browser-token")
    expect((await readPlatformSession()).token).toBe("browser-token")
    await signOutPlatform()
    expect(values.has("veto_token")).toBe(false)
  })
})
