"use client"
import { message } from "@/i18n/messages"
import { usePlatformTranslations } from "@/components/i18n-provider"

import { useEffect, useState } from "react"
import type { JSX, MouseEvent } from "react"
import { Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"

interface ConfirmDeleteButtonProps {
  disabled?: boolean
  disabledLabel?: string
  onConfirm: () => void
}

export function ConfirmDeleteButton({
  disabled = false,
  disabledLabel,
  onConfirm,
}: ConfirmDeleteButtonProps): JSX.Element {
  const { t, locale } = usePlatformTranslations()

  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!confirming) return
    const timeout = window.setTimeout(() => setConfirming(false), 3000)
    return () => window.clearTimeout(timeout)
  }, [confirming])

  function handleClick(event: MouseEvent<HTMLButtonElement>): void {
    event.preventDefault()
    event.stopPropagation()
    if (confirming) {
      onConfirm()
      setConfirming(false)
      return
    }
    setConfirming(true)
  }

  return (
    <Button
      type="button"
      variant={confirming ? "destructive" : "ghost"}
      size="sm"
      disabled={disabled}
      title={
        disabled
          ? disabledLabel
          : confirming
            ? t("platform_click_confirm_delete")
            : t("platform_delete")
      }
      aria-label={
        confirming
          ? t("platform_click_confirm_delete")
          : disabledLabel || t("platform_delete")
      }
      onClick={handleClick}
    >
      <Trash2 aria-hidden="true" />
      {t("platform_delete")}
    </Button>
  )
}
