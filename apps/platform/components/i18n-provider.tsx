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
import type { Locale } from "@/i18n/locale"
import { platformTranslate, type MessageValues } from "@/i18n/messages"

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
  const applyLocale = useCallback(
    (next: Locale) => {
      document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`
      document.documentElement.lang = next
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
    [pathname]
  )
  const setLocale = useCallback(
    (next: Locale) => {
      const request = ++revision.current
      setError(false)
      applyLocale(next)
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

export function LanguageSwitcher() {
  const { locale, setLocale } = usePlatformLocale()
  return (
    <select
      aria-label={locale === "zh-CN" ? "界面语言" : "Interface language"}
      value={locale}
      onChange={(event) => setLocale(event.target.value as Locale)}
      className="h-9 max-w-28 rounded-lg border border-input bg-background px-2 text-sm"
    >
      <option value="zh-CN">中文</option>
      <option value="en-US">English</option>
    </select>
  )
}
