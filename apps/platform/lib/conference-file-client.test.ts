import { afterEach, describe, expect, it, vi } from "vitest"

describe("organizer file client", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("sends required schedule fields on create and preserves omitted fields on patch", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test")
    vi.resetModules()
    const { createConference, updateConferenceMetadata } =
      await import("./conference-client")
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ ok: true, conference: { id: "conference-1" } })
          )
        )
      )
    vi.stubGlobal("fetch", fetchMock)
    const schedule = {
      startsAt: "2026-10-01T01:00:00.000Z",
      endsAt: "2026-10-03T10:00:00.000Z",
    }
    await createConference(
      "owner-token",
      { name: "大会", roleTemplates: [], committees: [], ...schedule },
      "create-key"
    )
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject(schedule)
    await updateConferenceMetadata("owner-token", "conference-1", 2, {
      endsAt: "2026-10-04T10:00:00.000Z",
    })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      endsAt: "2026-10-04T10:00:00.000Z",
    })
    expect(
      new Headers(fetchMock.mock.calls[1][1].headers).get("If-Match")
    ).toBe('"2"')
    await updateConferenceMetadata("owner-token", "conference-1", 3, {
      name: "新名称",
    })
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
      name: "新名称",
    })
  })

  it("preserves the expiry error code when a download reaches the deadline", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test")
    vi.resetModules()
    const { downloadOrganizerFile } = await import("./conference-client")
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              error: { code: "FILES_EXPIRED", message: "文件保存期限已过" },
            }),
            { status: 410 }
          )
        )
    )
    await expect(
      downloadOrganizerFile("owner-token", "conference-1", {
        id: "file-1",
        fileName: "file.txt",
      } as import("./conference-client").OrganizerFile)
    ).rejects.toMatchObject({ status: 410, code: "FILES_EXPIRED" })
  })

  it("filters file types through the mounted organizer route", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test")
    vi.resetModules()
    const { listOrganizerFiles } = await import("./conference-client")
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true, files: [] })))
    vi.stubGlobal("fetch", fetchMock)

    await listOrganizerFiles("owner-token", "conference-1", true, "工作文件")

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://api.example.test/v1/conferences/conference-1/files?fileType=%E5%B7%A5%E4%BD%9C%E6%96%87%E4%BB%B6"
    )
  })

  it("sends the current conference version when closing", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test")
    vi.resetModules()
    const { closeConference } = await import("./conference-client")
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          conference: { id: "conference-1", lifecycle: "closed", version: 8 },
        })
      )
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await closeConference("owner-token", "conference-1", 7)

    expect(result.lifecycle).toBe("closed")
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://api.example.test/v1/conferences/conference-1/close"
    )
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.method).toBe("POST")
    expect(new Headers(init.headers).get("If-Match")).toBe('"7"')
  })
})
