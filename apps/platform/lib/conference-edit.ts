import { platformTranslate, type MessageValues } from "@/i18n/messages"
import { defaultLocale, type Locale } from "@vetoexpress/i18n"
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
  name: "platform_conference_name",
  description: "platform_conference_description",
  organizer: "platform_organizer",
  startsAt: "platform_start_time",
  endsAt: "platform_end_time",
  structure: "platform_structure_edit_label",
}
export const editKeys = Object.keys(editLabels) as (keyof ConferenceEdit)[]
export function conferenceEdit(conference: Conference): ConferenceEdit {
  return {
    name: conference.name,
    description: conference.description ?? "",
    organizer: conference.organizer ?? "",
    startsAt: scheduleInput(conference.startsAt),
    endsAt: scheduleInput(conference.endsAt),
    structure: {
      roleTemplates: conference.roleTemplates,
      committees: conference.committees,
    },
  }
}
export function sameEditValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
export function mergeConferenceEdit(
  base: ConferenceEdit,
  local: ConferenceEdit,
  remote: ConferenceEdit
) {
  const merged = { ...local }
  const conflicts: (keyof ConferenceEdit)[] = []
  const changed = editKeys.filter(
    (key) => !sameEditValue(base[key], remote[key])
  )
  for (const key of changed) {
    if (
      sameEditValue(base[key], local[key]) ||
      sameEditValue(local[key], remote[key])
    ) {
      Object.assign(merged, { [key]: remote[key] })
    } else conflicts.push(key)
  }
  return { merged, conflicts, changed }
}

export function describeEditValue(
  value: ConferenceEdit[keyof ConferenceEdit],
  locale: Locale = defaultLocale
): string {
  const message = (key: string, values?: MessageValues) =>
    platformTranslate(key, values, locale)
  if (typeof value === "string") return value || message("platform_empty")
  return (
    [
      ...value.roleTemplates.map((role) =>
        message("platform_role_description_summary", {
          value1: role.name,
          value2: role.capabilities
            .map((capability) => message(CAPABILITY_LABELS[capability]))
            .join(locale === "zh-CN" ? "、" : ", "),
        })
      ),
      ...value.committees.map(
        (committee) =>
          `${committee.name}: ${committee.seats.map((seat) => `${seat.name}${seat.shortName ? ` / ${seat.shortName}` : ""} · ${value.roleTemplates.find((role) => (role.id ?? role.clientId) === seat.roleTemplateId)?.name ?? message("platform_role_not_selected")} · ${seat.hasVotingRights ? message("platform_has_voting_rights") : message("platform_no_voting_rights")}`).join(locale === "zh-CN" ? "；" : "; ") || message("platform_no_seats_summary")}`
      ),
    ].join("\n") || message("platform_empty")
  )
}
