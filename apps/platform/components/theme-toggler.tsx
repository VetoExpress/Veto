"use client"
import { usePlatformTranslations } from "@/components/i18n-provider"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"

import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler"

export function ThemeToggler({ className }: { className?: string }) {
  const { t, locale } = usePlatformTranslations()

  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return (
      <button
        type="button"
        className={className}
        aria-label={t("platform_toggle_theme")}
        disabled
      >
        <span className="size-4" aria-hidden="true" />
      </button>
    )
  }

  return (
    <AnimatedThemeToggler
      aria-label={t("platform_toggle_theme")}
      className={className}
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      onThemeChange={setTheme}
    />
  )
}
