import { describe, expect, it } from "vitest"
import {
  FILE_RETENTION_MS,
  filesExpired,
  formatSchedule,
  scheduleError,
  scheduleInput,
  scheduleInstant,
} from "./conference-schedule"

describe("conference schedule", () => {
  it("uses minute precision in the UTC+8 editor and submitted instants", () => {
    const instant = "2026-10-03T10:00:25.123Z"
    expect(scheduleInput(instant)).toBe("2026-10-03T18:00")
    expect(scheduleInstant(scheduleInput(instant))).toBe(
      "2026-10-03T10:00:00.000Z"
    )
    expect(scheduleInstant("2026-10-03T18:00:59.999")).toBe(
      "2026-10-03T10:00:00.000Z"
    )
    expect(scheduleInstant("")).toBeNull()
    expect(scheduleInput(null)).toBe("")
  })
  it("preserves the UTC+8 date across a UTC day boundary", () => {
    expect(scheduleInput("2026-10-03T20:15:59.999Z")).toBe("2026-10-04T04:15")
    expect(scheduleInstant("2026-10-04T04:15")).toBe("2026-10-03T20:15:00.000Z")
  })
  it.each(["zh-CN", "en-US"] as const)(
    "displays schedules to the minute in %s",
    (locale) => {
      const formatted = formatSchedule("2026-10-03T10:00:25.123Z", locale)
      expect(formatted).toContain("18:00")
      expect(formatted).not.toContain("18:00:")
      expect(formatted).toContain("UTC+8")
    }
  )
  it("requires both dates and rejects equal, reversed and invalid ranges", () => {
    expect(scheduleError("", "")).toBe("请选择开始时间")
    expect(scheduleError("", "2026-10-03T18:00")).toBe("请选择开始时间")
    expect(scheduleError("2026-10-03T18:00", "")).toBe("请选择结束时间")
    expect(scheduleError("2026-10-03T17:00", "2026-10-03T18:00")).toBe("")
    expect(scheduleError("2026-10-03T18:00", "2026-10-03T18:00")).not.toBe("")
    expect(scheduleError("2026-10-04T18:00", "2026-10-03T18:00")).not.toBe("")
    expect(scheduleError("invalid", "")).not.toBe("")
    expect(scheduleError("invalid", "2026-10-03T18:00")).toBe(
      "请输入有效的会议时间"
    )
  })
  it("validates ranges using the same minute precision as submission", () => {
    expect(
      scheduleError("2026-10-03T18:00:01.123", "2026-10-03T18:00:59.999")
    ).not.toBe("")
    expect(
      scheduleError("2026-10-03T18:00:59.999", "2026-10-03T18:01:00.001")
    ).toBe("")
  })
  it("expires at exactly 72 hours and respects irreversible cleanup", () => {
    const end = Date.parse("2026-10-03T10:00:00Z")
    const deadline = new Date(end + FILE_RETENTION_MS).toISOString()
    expect(deadline).toBe("2026-10-06T10:00:00.000Z")
    expect(filesExpired(deadline, null, end + FILE_RETENTION_MS - 1)).toBe(
      false
    )
    expect(filesExpired(deadline, null, end + FILE_RETENTION_MS)).toBe(true)
    expect(filesExpired(null, null)).toBe(false)
    expect(filesExpired(null, "2026-10-06T10:00:00Z")).toBe(true)
  })
})
