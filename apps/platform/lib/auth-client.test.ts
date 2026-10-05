import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("password reset client", () => {
  it("shares profile transport and cache in the browser", async () => {
    const { updateAccountProfile, readCachedUser } =
      await import("./auth-client")
    const user = {
      name: "更新用户",
      email: "user@example.test",
      avatar: "https://example.test/avatar.png",
      organization: "模联",
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true, user })))
    vi.stubGlobal("fetch", fetchMock)
    expect(
      await updateAccountProfile("token", { name: user.name, avatar: "base64" })
    ).toEqual(user)
    expect(readCachedUser("token")).toEqual(user)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "PATCH",
      body: JSON.stringify({ name: user.name, avatar: "base64" }),
    })
  })
  it("uses the desktop session for embedded profile updates and recovery", async () => {
    const user = {
      name: "桌面用户",
      email: "user@example.test",
      avatar: "",
      organization: "模联",
    }
    const result = {
      ok: true,
      session: { user, persistent: true, warning: null },
    }
    const api = {
      getAccessToken: vi.fn(),
      adoptToken: vi.fn(),
      updateProfile: vi.fn().mockResolvedValue(result),
      sendPasswordCode: vi.fn().mockResolvedValue(result),
      resetPassword: vi.fn().mockResolvedValue(result),
    }
    vi.stubGlobal("window", { veto: { account: api } })
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const {
      updateAccountProfile,
      sendAccountPasswordCode,
      resetAccountPassword,
    } = await import("./auth-client")
    expect(await updateAccountProfile("token", { name: "新名字" })).toEqual(
      user
    )
    await sendAccountPasswordCode("ignored@example.test")
    await resetAccountPassword("ignored@example.test", "123456", "password")
    expect(api.updateProfile).toHaveBeenCalledWith({ name: "新名字" })
    expect(api.sendPasswordCode).toHaveBeenCalledWith()
    expect(api.resetPassword).toHaveBeenCalledWith("123456", "password")
    expect(fetchMock).not.toHaveBeenCalled()
  })
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test/")
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("sends and resends through the password reset route without authentication", async () => {
    const { forgotPassword } = await import("./auth-client")
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ ok: true })))
      )
    vi.stubGlobal("fetch", fetchMock)

    await forgotPassword("organizer@example.test")
    await forgotPassword("organizer@example.test")

    expect(fetchMock).toHaveBeenCalledTimes(2)
    for (const [url, init] of fetchMock.mock.calls) {
      expect(String(url)).toBe(
        "https://api.example.test/v1/auth/forgot-password"
      )
      expect(init.method).toBe("POST")
      expect(new Headers(init.headers).get("Authorization")).toBeNull()
      expect(new Headers(init.headers).get("content-type")).toBe(
        "application/json"
      )
      expect(JSON.parse(init.body)).toEqual({ email: "organizer@example.test" })
    }
  })

  it("submits the email, six-digit code and new password directly", async () => {
    const { resetPassword } = await import("./auth-client")
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })))
    vi.stubGlobal("fetch", fetchMock)

    await resetPassword("organizer@example.test", "012345", " new password ")

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe("https://api.example.test/v1/auth/reset-password")
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body)).toEqual({
      email: "organizer@example.test",
      code: "012345",
      password: " new password ",
    })
  })

  it.each([
    [429, "发送频率过高，请稍后再试"],
    [503, "邮件服务暂不可用"],
  ])("preserves the send error at status %s", async (status, error) => {
    const { forgotPassword } = await import("./auth-client")
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ ok: false, error }), { status })
        )
    )

    await expect(
      forgotPassword("organizer@example.test")
    ).rejects.toMatchObject({
      name: "AuthError",
      status,
      message: error,
    })
  })

  it("preserves the invalid or expired code error", async () => {
    const { resetPassword } = await import("./auth-client")
    const error = "验证码错误、已失效或尝试次数过多，请重新发送验证码"
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ ok: false, error }), { status: 400 })
        )
    )

    await expect(
      resetPassword("organizer@example.test", "123456", "secret")
    ).rejects.toMatchObject({ status: 400, message: error })
  })

  it("reports a network failure", async () => {
    const { forgotPassword } = await import("./auth-client")
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))
    )
    await expect(forgotPassword("organizer@example.test")).rejects.toThrow(
      "无法连接认证服务"
    )
  })

  it("does not treat a malformed response as a successful reset", async () => {
    const { resetPassword } = await import("./auth-client")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not JSON")))
    await expect(
      resetPassword("organizer@example.test", "123456", "secret")
    ).rejects.toThrow("重设密码失败，请稍后再试")
  })
})
