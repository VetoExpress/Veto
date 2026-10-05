export const FILE_RETENTION_MS = 72 * 60 * 60 * 1000

// The editor uses an explicit UTC+8 timezone, independent of the device timezone.
export function scheduleInput(value?: string | null): string {
  return value
    ? new Date(Date.parse(value) + 8 * 3600_000).toISOString().slice(0, 23)
    : ""
}

export function scheduleInstant(value: string): string | null {
  return value ? new Date(`${value}+08:00`).toISOString() : null
}

export function scheduleError(start: string, end: string): string {
  if (!start) return "请选择开始时间"
  if (!end) return "请选择结束时间"
  const a = start ? Date.parse(`${start}+08:00`) : null
  const b = end ? Date.parse(`${end}+08:00`) : null
  if (
    (a !== null && !Number.isFinite(a)) ||
    (b !== null && !Number.isFinite(b))
  )
    return "请输入有效的会议时间"
  return a !== null && b !== null && b <= a ? "结束时间必须晚于开始时间" : ""
}

export function formatSchedule(value?: string | null): string {
  if (!value) return "未设置"
  return (
    new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date(value)) + "（UTC+8）"
  )
}

export function filesExpired(
  deadline?: string | null,
  claimed?: string | null,
  now = Date.now()
): boolean {
  return Boolean(claimed) || Boolean(deadline && Date.parse(deadline) <= now)
}
