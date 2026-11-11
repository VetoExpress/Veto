"use client"
import { message } from "@/i18n/messages"
import { usePlatformTranslations } from "@/components/i18n-provider"

import { useEffect } from "react"

export function useUnsavedChanges(dirty: boolean) {
  const { t, locale } = usePlatformTranslations()

  useEffect(() => {
    if (!dirty) return
    const onUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return
      const anchor =
        event.target instanceof Element ? event.target.closest("a") : null
      if (
        !anchor ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      )
        return
      const next = new URL(anchor.href, location.href)
      if (
        next.pathname === location.pathname &&
        next.search === location.search
      )
        return
      if (!window.confirm(t("platform_confirm_leave_unsaved"))) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener("beforeunload", onUnload)
    document.addEventListener("click", onClick, true)
    return () => {
      window.removeEventListener("beforeunload", onUnload)
      document.removeEventListener("click", onClick, true)
    }
  }, [dirty, t])
}
