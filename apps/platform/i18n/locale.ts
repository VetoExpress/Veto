export const locales = ["zh-CN", "en-US"] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = "zh-CN"
export const LOCALE_COOKIE = "veto-locale"

export function isLocale(value: unknown): value is Locale {
  return value === "zh-CN" || value === "en-US"
}

function matchLocale(value?: string | null): Locale | undefined {
  const language = value?.trim().replaceAll("_", "-").toLowerCase()
  if (language === "en" || language?.startsWith("en-")) return "en-US"
  if (language === "zh" || language?.startsWith("zh-")) return "zh-CN"
  return undefined
}

export function resolveLocale(value?: string | null): Locale {
  return matchLocale(value) ?? defaultLocale
}

export function resolvePreferredLocale(value?: string | null): Locale {
  for (const entry of value?.split(",") ?? []) {
    const locale = matchLocale(entry.split(";")[0])
    if (locale) return locale
  }
  return defaultLocale
}
