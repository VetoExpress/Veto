import { describe, expect, it } from "vitest"
import type { Conference } from "./conference-client"
import { conferenceReadiness } from "./conference-readiness"

const conference = {
  timelineMode: "none", timeline: null,
  roleTemplates: [{ id: "chair", name: "主席", capabilities: ["control_conference"] }],
  committees: [{ id: "c", name: "安理会", type: "cabinet", seats: [{ id: "s", name: "主席", roleTemplateId: "chair", inviteCode: "KEY", inviteActive: true }], agenda: [] }],
} as unknown as Conference

describe("开会前检查", () => {
  it("accepts a configured conference without a timeline", () => {
    expect(conferenceReadiness(conference).every((check) => check.ready)).toBe(true)
  })
  it("does not mark an empty conference ready", () => {
    expect(conferenceReadiness({ ...conference, committees: [], timelineMode: "undecided" }).filter((check) => !check.ready).map((check) => check.id)).toEqual(["committees", "invites", "timeline"])
  })
  it("requires chair capability instead of guessing from the role name", () => {
    expect(conferenceReadiness({ ...conference, roleTemplates: [{ id: "chair", name: "主席", capabilities: [] }] }).find((check) => check.id === "chair-c")?.ready).toBe(false)
  })
  it("requires an IPC controller only when a timeline is configured", () => {
    expect(conferenceReadiness({ ...conference, timelineMode: "configured" }).find((check) => check.id === "controller")?.ready).toBe(false)
    expect(conferenceReadiness({ ...conference, committees: [{ ...conference.committees[0], type: "mpc" }] }).some((check) => check.id === "chair-c")).toBe(false)
  })
})
