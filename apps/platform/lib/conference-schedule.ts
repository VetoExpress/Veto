import { platformTranslate } from "@/i18n/messages"
import { defaultLocale, type Locale } from "@/i18n/locale"
export const FILE_RETENTION_MS = 72 * 60 * 60 * 1000

// The editor uses an explicit UTC+8 timezone, independent of the device timezone.
export function scheduleInput(value?: string | null): string {
  return value
    ? new Date(Date.parse(value) + 8 * 3600_000).toISOString().slice(0, 16)
    : ""
}

export function scheduleInstant(value: string): string | null {
  if (!value) return null
  const instant = new Date(`${value}+08:00`)
  instant.setUTCSeconds(0, 0)
  return instant.toISOString()
}

export function scheduleError(
  start: string,
  end: string,
  locale: Locale = defaultLocale
): string {
  const message = (key: string) => platformTranslate(key, {}, locale)
  if (!start) return message("platform_select_start")
  if (!end) return message("platform_select_end")
  const a = start ? Date.parse(`${start}+08:00`) : null
  const b = end ? Date.parse(`${end}+08:00`) : null
  if (
    (a !== null && !Number.isFinite(a)) ||
    (b !== null && !Number.isFinite(b))
  )
    return message("platform_invalid_schedule")
  return a !== null &&
    b !== null &&
    Math.floor(b / 60_000) <= Math.floor(a / 60_000)
    ? message("platform_end_after_start")
    : ""
}

export function formatSchedule(
  value?: string | null,
  locale: Locale = defaultLocale
): string {
  if (!value) return platformTranslate("platform_not_set", {}, locale)
  return (
    new Intl.DateTimeFormat(locale, {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(value)) + (locale === "zh-CN" ? "（UTC+8）" : " (UTC+8)")
  )
}

export function filesExpired(
  deadline?: string | null,
  claimed?: string | null,
  now = Date.now()
): boolean {
  return Boolean(claimed) || Boolean(deadline && Date.parse(deadline) <= now)
}
