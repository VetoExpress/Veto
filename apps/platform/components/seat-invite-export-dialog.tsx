"use client"
import { message } from "@/i18n/messages"
import { usePlatformTranslations } from "@/components/i18n-provider"

import { useState } from "react"
import type { JSX } from "react"
import { Download } from "lucide-react"
import type { SeatInviteExportRow } from "@vetoexpress/utils/seat-invite-export"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface SeatInviteExportDialogProps {
  filenameBase: string
  rows: SeatInviteExportRow[]
  description?: string
  missingCount?: number
  disabled?: boolean
}

function download(data: BlobPart, mimeType: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([data], { type: mimeType }))
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function SeatInviteExportDialog({
  filenameBase,
  rows,
  description = "platform_export_invites_hint",
  missingCount = 0,
  disabled = false,
}: SeatInviteExportDialogProps): JSX.Element {
  const { t, locale } = usePlatformTranslations()

  const [open, setOpen] = useState(false)
  const [error, setError] = useState("")
  const [exporting, setExporting] = useState(false)
  const filename =
    (filenameBase.trim() || t("platform_seat"))
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .replace(/[. ]+$/g, "") || t("platform_seat")

  async function exportFile(format: "text" | "excel"): Promise<void> {
    if (!rows.length || exporting) return
    setError("")
    setExporting(true)
    try {
      const { createSeatInviteText, createSeatInviteWorkbook } =
        await import("@vetoexpress/utils/seat-invite-export")
      if (format === "text") {
        download(
          `\uFEFF${createSeatInviteText(rows, locale)}`,
          "text/plain;charset=utf-8",
          t("platform_invite_text_filename", { value1: filename })
        )
      } else {
        download(
          createSeatInviteWorkbook(rows, locale),
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          t("platform_invite_excel_filename", { value1: filename })
        )
      }
      setOpen(false)
    } catch {
      setError("platform_export_failed")
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => {
          setError("")
          setOpen(true)
        }}
      >
        <Download aria-hidden="true" />
        {t("platform_export_invites")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100%-2rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("platform_export_invites")}</DialogTitle>
            <DialogDescription>
              {description.startsWith("platform_")
                ? t(description)
                : description}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              {t("platform_export_count_start")}
              {rows.length}
              {t("platform_export_count_end")}
            </p>
            {missingCount > 0 ? (
              <p className="text-muted-foreground">
                {missingCount} {t("platform_missing_invites_hint")}
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="text-destructive">
                {error.startsWith("platform_") ? t(error) : error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              {t("platform_cancel")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!rows.length || exporting}
              onClick={() => void exportFile("text")}
            >
              {t("platform_export_text")}
            </Button>
            <Button
              type="button"
              disabled={!rows.length || exporting}
              onClick={() => void exportFile("excel")}
            >
              {t("platform_export_excel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
