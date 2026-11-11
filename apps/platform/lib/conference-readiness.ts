import { message } from "@/i18n/messages"
import { platformTranslate, type MessageValues } from "@/i18n/messages"
import { defaultLocale, type Locale } from "@vetoexpress/i18n"
import type { Conference } from "./conference-client"

export interface ReadinessCheck {
  id: string
  label: string
  detail: string
  ready: boolean
  target: "settings" | "seats"
  committeeId?: string
}

/** Configuration checks only; readiness is advisory, never an activation authority. */
export function conferenceReadiness(
  conference: Conference,
  locale: Locale = defaultLocale
): ReadinessCheck[] {
  const message = (key: string, values?: MessageValues) =>
    platformTranslate(key, values, locale)
  const checks: ReadinessCheck[] = []
  const roles = new Map(
    conference.roleTemplates.map((role) => [role.id ?? role.clientId, role])
  )
  checks.push({
    id: "committees",
    label: message("platform_committee"),
    ready: conference.committees.length > 0,
    detail: message("platform_configured_committees", {
      value1: conference.committees.length,
    }),
    target: "settings",
  })
  for (const [index, committee] of conference.committees.entries()) {
    const id = committee.id ?? committee.clientId ?? String(index)
    const chair = committee.seats.some((seat) =>
      roles
        .get(seat.roleTemplateId)
        ?.capabilities.includes("control_conference")
    )
    checks.push({
      id: `seats-${id}`,
      label: message("platform_committee_seats_label", {
        committee: committee.name,
      }),
      ready: committee.seats.length > 0,
      detail: message("platform_seat_count", {
        value1: committee.seats.length,
      }),
      target: "settings",
      committeeId: committee.id,
    })
    // MPC / IPC content workflows do not require a local parliamentary Chair.
    if (committee.type === "cabinet")
      checks.push({
        id: `chair-${id}`,
        label: message("platform_committee_chair_label", {
          committee: committee.name,
        }),
        ready: chair,
        detail: chair
          ? message("platform_chair_configured")
          : message("platform_chair_required"),
        target: "settings",
      })
  }
  const seats = conference.committees.flatMap((committee) => committee.seats)
  const missing = seats.filter(
    (seat) => !seat.inviteCode || seat.inviteActive === false
  ).length
  checks.push({
    id: "invites",
    label: message("platform_seat_invites"),
    ready: seats.length > 0 && missing === 0,
    detail: message("platform_valid_key_count", {
      value1: seats.length - missing,
      value2: seats.length,
    }),
    target: "seats",
  })
  const timelineReady =
    conference.timelineMode === "none" ||
    (conference.timelineMode === "configured" &&
      !!conference.timeline &&
      Number.isFinite(conference.timeline.initialSimTime) &&
      Number.isInteger(conference.timeline.ratio) &&
      conference.timeline.ratio > 0)
  checks.push({
    id: "timeline",
    label: message("platform_simulation_timeline"),
    ready: timelineReady,
    detail:
      conference.timelineMode === "none"
        ? message("platform_timeline_disabled")
        : timelineReady
          ? message("platform_timeline_ready")
          : message("platform_timeline_configuration_required"),
    target: "settings",
  })
  if (conference.timelineMode === "configured")
    checks.push({
      id: "controller",
      label: message("platform_timeline_controller"),
      ready: conference.committees.some(
        (committee) =>
          committee.type === "ipc" &&
          committee.seats.some((seat) =>
            roles
              .get(seat.roleTemplateId)
              ?.capabilities.includes("control_timeline")
          )
      ),
      detail: message("platform_timeline_controller_required"),
      target: "settings",
    })
  return checks
}
