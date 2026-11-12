"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { NextIntlClientProvider, useLocale } from "next-intl"
import { usePathname } from "next/navigation"
import { LOCALE_COOKIE, messages, resolveLocale } from "@/i18n/messages"
import { isLocale, type Locale } from "@/i18n/locale"
import { platformTranslate, type MessageValues } from "@/i18n/messages"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

const LocaleContext = createContext<{
  locale: Locale
  setLocale: (locale: Locale) => void
} | null>(null)

interface LocaleBridge {
  getLocale: () => Promise<Locale>
  setLocale: (locale: Locale) => Promise<unknown>
  onLocaleChanged: (callback: (locale: Locale) => void) => () => void
}

function localeBridge(): LocaleBridge | undefined {
  return (
    window as unknown as {
      veto?: { i18n?: LocaleBridge }
    }
  ).veto?.i18n
}

export function I18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale
  children: ReactNode
}) {
  const [locale, updateLocale] = useState(initialLocale)
  const pathname = usePathname()
  const revision = useRef(0)
  const currentLocale = useRef(initialLocale)
  const [error, setError] = useState(false)
  const syncLocaleParameter = useCallback((next: Locale) => {
    const url = new URL(window.location.href)
    if (!localeBridge() && !url.searchParams.has("lang")) return
    if (url.searchParams.get("lang") === next) return
    url.searchParams.set("lang", next)
    window.history.replaceState(window.history.state, "", url)
  }, [])
  const applyLocale = useCallback(
    (next: Locale, persist = false) => {
      if (persist)
        document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`
      document.documentElement.lang = next
      syncLocaleParameter(next)
      if (currentLocale.current === next) return
      currentLocale.current = next
      updateLocale(next)
      const titleKey =
        pathname === "/login"
          ? "platform_login"
          : pathname === "/account"
            ? "platform_account"
            : pathname === "/conferences/new"
              ? "platform_create_conference"
              : pathname.startsWith("/conferences/")
                ? "platform_conference_details"
                : pathname === "/conferences"
                  ? "platform_conferences"
                  : undefined
      if (titleKey)
        document.title = `${platformTranslate(titleKey, {}, next)} | ${platformTranslate("platform_brand", {}, next)}`
    },
    [pathname, syncLocaleParameter]
  )
  const setLocale = useCallback(
    (next: Locale) => {
      const request = ++revision.current
      setError(false)
      applyLocale(next, true)
      const bridge = localeBridge()
      if (bridge)
        void bridge.setLocale(next).catch((cause: unknown) => {
          console.error("Platform language preference save failed", {
            operation: "setLocale",
            locale: next,
            impact: "preference may not persist",
            error: cause instanceof Error ? cause.name : typeof cause,
          })
          if (request === revision.current && currentLocale.current === next)
            setError(true)
        })
    },
    [applyLocale]
  )
  useEffect(() => {
    const bridge = localeBridge()
    if (!bridge) return
    let active = true
    const request = revision.current
    const unsubscribe = bridge.onLocaleChanged((next) => {
      if (!active) return
      revision.current++
      applyLocale(resolveLocale(next))
    })
    void bridge
      .getLocale()
      .then((next) => {
        if (active && request === revision.current)
          applyLocale(resolveLocale(next))
      })
      .catch((cause: unknown) => {
        console.error("Platform language preference load failed", {
          operation: "getLocale",
          impact: "using request cookie",
          error: cause instanceof Error ? cause.name : typeof cause,
        })
      })
    return () => {
      active = false
      unsubscribe()
    }
  }, [applyLocale])
  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale])
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])
  return (
    <LocaleContext.Provider value={value}>
      <NextIntlClientProvider
        locale={locale}
        messages={messages[locale]}
        timeZone="Asia/Shanghai"
      >
        {children}
        {error && (
          <p
            role="alert"
            className="fixed right-4 bottom-4 z-50 rounded-lg border bg-background p-3 text-sm"
          >
            {platformTranslate("common_language_save_failed", {}, locale)}
          </p>
        )}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  )
}

export function usePlatformLocale() {
  const context = useContext(LocaleContext)
  if (!context) throw new Error("I18nProvider is required")
  return context
}

export function usePlatformTranslations() {
  const locale = useLocale() as Locale
  const translate = useCallback(
    (key: string, values?: MessageValues) =>
      platformTranslate(key, values, locale),
    [locale]
  )
  return { t: translate, locale }
}

const languageNames = {
  "zh-CN": "中文",
  "en-US": "English",
} as const

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = usePlatformLocale()
  const { t } = usePlatformTranslations()
  return (
    <Select
      value={locale}
      items={languageNames}
      onValueChange={(next) => {
        if (isLocale(next)) setLocale(next)
      }}
    >
      <SelectTrigger
        aria-label={t("common_language")}
        className={cn("h-9 w-28 bg-background", className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {Object.entries(languageNames).map(([value, label]) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
