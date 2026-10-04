import type { Conference, ConferenceStructure } from "./conference-client"
import { CAPABILITY_LABELS } from "./conference-client"
import { scheduleInput } from "./conference-schedule"

export interface ConferenceEdit {
  name: string
  description: string
  organizer: string
  startsAt: string
  endsAt: string
  structure: ConferenceStructure
}
export const editLabels: Record<keyof ConferenceEdit, string> = {
  name: "大会名称", description: "大会说明", organizer: "主办方",
  startsAt: "开始时间", endsAt: "结束时间", structure: "角色、委员会和席位配置",
}
export const editKeys = Object.keys(editLabels) as (keyof ConferenceEdit)[]
export function conferenceEdit(conference: Conference): ConferenceEdit {
  return {
    name: conference.name, description: conference.description ?? "", organizer: conference.organizer ?? "",
    startsAt: scheduleInput(conference.startsAt), endsAt: scheduleInput(conference.endsAt),
    structure: { roleTemplates: conference.roleTemplates, committees: conference.committees },
  }
}
export function sameEditValue(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b) }
export function mergeConferenceEdit(base: ConferenceEdit, local: ConferenceEdit, remote: ConferenceEdit) {
  const merged = { ...local }
  const conflicts: (keyof ConferenceEdit)[] = []
  const changed = editKeys.filter((key) => !sameEditValue(base[key], remote[key]))
  for (const key of changed) {
    if (sameEditValue(base[key], local[key]) || sameEditValue(local[key], remote[key])) {
      Object.assign(merged, { [key]: remote[key] })
    } else conflicts.push(key)
  }
  return { merged, conflicts, changed }
}

export function describeEditValue(value: ConferenceEdit[keyof ConferenceEdit]): string {
  if (typeof value === "string") return value || "（空）"
  return [
    ...value.roleTemplates.map((role) => `角色：${role.name}（${role.capabilities.map((capability) => CAPABILITY_LABELS[capability]).join("、")}）`),
    ...value.committees.map((committee) => `${committee.name}：${committee.seats.map((seat) => `${seat.name}${seat.shortName ? ` / ${seat.shortName}` : ""} · ${value.roleTemplates.find((role) => (role.id ?? role.clientId) === seat.roleTemplateId)?.name ?? "未选角色"} · ${seat.hasVotingRights ? "有投票权" : "无投票权"}`).join("；") || "无席位"}`),
  ].join("\n") || "（空）"
}
