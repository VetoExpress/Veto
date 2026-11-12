export const locales = ["zh-CN", "en-US"] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = "zh-CN"
export const LOCALE_COOKIE = "veto-locale"

export function isLocale(value: unknown): value is Locale {
  return value === "zh-CN" || value === "en-US"
}

export function resolveLocale(value?: string | null): Locale {
  const language = value?.trim().replaceAll("_", "-").toLowerCase()
  return language === "en" || language?.startsWith("en-")
    ? "en-US"
    : defaultLocale
}
