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
export function conferenceReadiness(conference: Conference): ReadinessCheck[] {
  const checks: ReadinessCheck[] = []
  const roles = new Map(conference.roleTemplates.map((role) => [role.id ?? role.clientId, role]))
  checks.push({
    id: "committees", label: "委员会", ready: conference.committees.length > 0,
    detail: `已配置 ${conference.committees.length} 个委员会`, target: "settings",
  })
  for (const [index, committee] of conference.committees.entries()) {
    const id = committee.id ?? committee.clientId ?? String(index)
    const chair = committee.seats.some((seat) => roles.get(seat.roleTemplateId)?.capabilities.includes("control_conference"))
    checks.push({
      id: `seats-${id}`, label: `${committee.name} · 席位`, ready: committee.seats.length > 0,
      detail: `${committee.seats.length} 个席位`, target: "settings", committeeId: committee.id,
    })
    // MPC / IPC content workflows do not require a local parliamentary Chair.
    if (committee.type === "cabinet") checks.push({
      id: `chair-${id}`, label: `${committee.name} · 主席权限`, ready: chair,
      detail: chair ? "已有席位具备会议控制能力" : "需要为主持席位的角色开启会议控制能力", target: "settings",
    })
  }
  const seats = conference.committees.flatMap((committee) => committee.seats)
  const missing = seats.filter((seat) => !seat.inviteCode || seat.inviteActive === false).length
  checks.push({
    id: "invites", label: "席位邀请码", ready: seats.length > 0 && missing === 0,
    detail: `${seats.length - missing} / ${seats.length} 个席位已有有效 Key`, target: "seats",
  })
  const timelineReady = conference.timelineMode === "none" || (
    conference.timelineMode === "configured" && !!conference.timeline &&
    Number.isFinite(conference.timeline.initialSimTime) &&
    Number.isInteger(conference.timeline.ratio) && conference.timeline.ratio > 0
  )
  checks.push({
    id: "timeline", label: "模拟时间线", ready: timelineReady,
    detail: conference.timelineMode === "none" ? "已选择不使用时间线" : timelineReady ? "时间线配置完整" : "请选择不使用时间线，或完成时间线配置", target: "settings",
  })
  if (conference.timelineMode === "configured") checks.push({
    id: "controller", label: "时间线控制席位",
    ready: conference.committees.some((committee) => committee.type === "ipc" && committee.seats.some((seat) => roles.get(seat.roleTemplateId)?.capabilities.includes("control_timeline"))),
    detail: "使用时间线时，需要 IPC 中有席位具备时间线控制能力", target: "settings",
  })
  return checks
}
