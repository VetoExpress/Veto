"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"

import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler"

export function ThemeToggler({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return (
      <button
        type="button"
        className={className}
        aria-label="切换主题"
        disabled
      >
        <span className="size-4" aria-hidden="true" />
      </button>
    )
  }

  return (
    <AnimatedThemeToggler
      aria-label="切换主题"
      className={className}
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      onThemeChange={setTheme}
    />
  )
}
