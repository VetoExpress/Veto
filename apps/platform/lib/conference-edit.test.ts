import { describe, expect, it } from "vitest"
import { mergeConferenceEdit, type ConferenceEdit } from "./conference-edit"

const base: ConferenceEdit = { name: "大会", description: "", organizer: "学校", startsAt: "", endsAt: "", structure: { roleTemplates: [], committees: [] } }
describe("大会并发编辑", () => {
  it("merges non-overlapping remote changes while retaining local inputs", () => {
    const result = mergeConferenceEdit(base, { ...base, name: "我的名称" }, { ...base, organizer: "新学校" })
    expect(result.merged).toMatchObject({ name: "我的名称", organizer: "新学校" })
    expect(result.conflicts).toEqual([])
    expect(result.changed).toEqual(["organizer"])
  })
  it("requires a choice for overlapping changes including removed structures", () => {
    const local = { ...base, name: "我的名称", structure: { roleTemplates: [], committees: [{ id: "new", name: "新委员会", type: "cabinet" as const, seats: [], agenda: [] }] } }
    const remote = { ...base, name: "别人的名称", structure: { roleTemplates: [], committees: [{ id: "remote", name: "其他委员会", type: "cabinet" as const, seats: [], agenda: [] }] } }
    expect(mergeConferenceEdit(base, local, remote).conflicts).toEqual(["name", "structure"])
    expect(local.name).toBe("我的名称")
  })
  it("does not report identical concurrent edits as conflicts", () => {
    expect(mergeConferenceEdit(base, { ...base, name: "相同" }, { ...base, name: "相同" }).conflicts).toEqual([])
  })
})
