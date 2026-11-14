"use client"
import { message } from "@/i18n/messages"
import { usePlatformTranslations } from "@/components/i18n-provider"

import { useRef, useState } from "react"
import type { ChangeEvent, JSX } from "react"
import { FileSpreadsheet, FileText, Upload } from "lucide-react"
import {
  SeatImportError,
  parseSeatText,
  readSeatWorkbook,
  type ImportedSeat,
  type SeatWorkbook,
} from "@vetoexpress/utils/seat-import"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type ImportMode = "excel" | "text"
type ImportStep = "format" | "text" | "sheet" | "preview"

interface SeatImportDialogProps {
  disabled?: boolean
  target?: { value: string; label: string }
  roleLabel: (roleName: string, target?: string) => string
  onImport: (seats: ImportedSeat[], target?: string) => void
}

function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof SeatImportError))
    return error instanceof Error ? error.message : fallback
  if (error.code === "empty_workbook") return message("platform_empty_workbook")
  if (error.code === "sheet_not_found")
    return message("platform_sheet_not_found")
  if (error.code === "no_valid_rows") return fallback
  return fallback
}

export function SeatImportDialog({
  disabled = false,
  target,
  roleLabel,
  onImport,
}: SeatImportDialogProps): JSX.Element {
  const { t, locale } = usePlatformTranslations()

  const inputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<ImportStep | null>(null)
  const [mode, setMode] = useState<ImportMode>("excel")
  const [text, setText] = useState("")
  const [error, setError] = useState("")
  const [workbook, setWorkbook] = useState<SeatWorkbook | null>(null)
  const [selectedSheet, setSelectedSheet] = useState("")
  const [rows, setRows] = useState<ImportedSeat[]>([])
  const activeTarget = target?.value

  const hasUnmatchedRole = rows.some(
    (row) =>
      row.roleName && roleLabel(row.roleName, activeTarget) === "unmatched"
  )

  function clear(): void {
    setText("")
    setError("")
    setWorkbook(null)
    setSelectedSheet("")
    setRows([])
  }

  function close(): void {
    setStep(null)
    clear()
  }

  function openFormat(nextMode: ImportMode): void {
    clear()
    setMode(nextMode)
    setStep("format")
  }

  function continueFromFormat(): void {
    setError("")
    if (mode === "excel") {
      setStep(null)
      inputRef.current?.click()
      return
    }
    setStep("text")
  }

  async function handleFile(
    event: ChangeEvent<HTMLInputElement>
  ): Promise<void> {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ""
    if (!file) return

    try {
      const reader = readSeatWorkbook(await file.arrayBuffer())
      setWorkbook(reader)
      setSelectedSheet(reader.sheetNames[0])
      setError("")
      setStep("sheet")
    } catch (cause) {
      setError(errorMessage(cause, message("platform_read_excel_failed")))
      setStep("format")
    }
  }

  function readSelectedSheet(): void {
    if (!workbook || !selectedSheet) return
    try {
      setRows(workbook.importSheet(selectedSheet, "conference"))
      setError("")
      setStep("preview")
    } catch (cause) {
      setRows([])
      setError(
        errorMessage(cause, message("platform_no_valid_spreadsheet_rows"))
      )
    }
  }

  function readText(): void {
    try {
      setRows(parseSeatText(text, "conference"))
      setError("")
      setStep("preview")
    } catch (cause) {
      setRows([])
      setError(errorMessage(cause, message("platform_no_valid_text_rows")))
    }
  }

  function confirmImport(): void {
    if (rows.length === 0 || disabled) return
    onImport(rows, activeTarget)
    close()
  }

  return (
    <>
      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={(event) => void handleFile(event)}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => openFormat("excel")}
      >
        <FileSpreadsheet aria-hidden="true" />
        {t("platform_import_excel")}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => openFormat("text")}
      >
        <FileText aria-hidden="true" />
        {t("platform_import_text")}
      </Button>

      <Dialog
        open={step !== null}
        onOpenChange={(open) => {
          if (!open) close()
        }}
      >
        <DialogContent
          className={
            step === "preview"
              ? "max-h-[85dvh] w-[calc(100%-2rem)] min-w-0 overflow-x-hidden overflow-y-auto sm:max-w-4xl"
              : step === "text"
                ? "w-[calc(100%-2rem)] min-w-0 sm:max-w-2xl"
                : "w-[calc(100%-2rem)] min-w-0 sm:max-w-2xl"
          }
        >
          {step === "format" ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {mode === "excel"
                    ? t("platform_import_excel_seats")
                    : t("platform_import_text_seats")}
                </DialogTitle>
                <DialogDescription>
                  {t("platform_import_format_hint")}
                </DialogDescription>
              </DialogHeader>

              {mode === "excel" ? (
                <div className="flex flex-col gap-3 text-sm text-muted-foreground">
                  <p>{t("platform_spreadsheet_header_hint")}</p>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full min-w-lg text-sm">
                      <thead className="bg-muted/50 text-left text-xs">
                        <tr>
                          <th className="px-3 py-2 font-medium">
                            {t("platform_column_a")}
                          </th>
                          <th className="px-3 py-2 font-medium">
                            {t("platform_column_b")}
                          </th>
                          <th className="px-3 py-2 font-medium">
                            {t("platform_column_c")}
                          </th>
                          <th className="px-3 py-2 font-medium">
                            {t("platform_column_d")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-t text-foreground">
                          <td className="px-3 py-2">
                            {t("platform_seat_name")}
                          </td>
                          <td className="px-3 py-2">
                            {t("platform_seat_short_name")}
                          </td>
                          <td className="px-3 py-2">
                            {t("platform_seat_type_role_name")}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p>{t("platform_choose_sheet_hint")}</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                  <p>{t("platform_text_format_intro")}</p>
                  <code className="rounded-lg bg-muted px-3 py-2 text-foreground">
                    {t("platform_text_import_format")}
                  </code>
                  <p>{t("platform_text_optional_fields_hint")}</p>
                  <p>{t("platform_text_veto_field_hint")}</p>
                  <p>{t("platform_text_delimiters_hint")}</p>
                </div>
              )}

              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error.startsWith("platform_") ? t(error) : error}
                </p>
              ) : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close}>
                  {t("platform_cancel")}
                </Button>
                <Button type="button" onClick={continueFromFormat}>
                  <Upload aria-hidden="true" />
                  {mode === "excel"
                    ? t("platform_choose_file")
                    : t("platform_continue_input")}
                </Button>
              </DialogFooter>
            </>
          ) : null}

          {step === "text" ? (
            <>
              <DialogHeader>
                <DialogTitle>{t("platform_paste_seats")}</DialogTitle>
                <DialogDescription>
                  {t("platform_text_import_hint")}
                </DialogDescription>
              </DialogHeader>
              <textarea
                className="min-h-56 resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={text}
                placeholder={t("platform_text_import_format")}
                aria-label={t("platform_seat_text")}
                onChange={(event) => setText(event.target.value)}
              />
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error.startsWith("platform_") ? t(error) : error}
                </p>
              ) : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close}>
                  {t("platform_cancel")}
                </Button>
                <Button
                  type="button"
                  disabled={!text.trim()}
                  onClick={readText}
                >
                  {t("platform_read_preview")}
                </Button>
              </DialogFooter>
            </>
          ) : null}

          {step === "sheet" ? (
            <>
              <DialogHeader>
                <DialogTitle>{t("platform_choose_sheet")}</DialogTitle>
                <DialogDescription>
                  {t("platform_sheet_header_hint")}
                </DialogDescription>
              </DialogHeader>
              <select
                className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={selectedSheet}
                aria-label={t("platform_worksheet")}
                onChange={(event) => {
                  setSelectedSheet(event.target.value)
                  setError("")
                }}
              >
                {workbook?.sheetNames.map((sheet) => (
                  <option key={sheet} value={sheet}>
                    {sheet}
                  </option>
                ))}
              </select>
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error.startsWith("platform_") ? t(error) : error}
                </p>
              ) : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close}>
                  {t("platform_cancel")}
                </Button>
                <Button
                  type="button"
                  disabled={!selectedSheet}
                  onClick={readSelectedSheet}
                >
                  {t("platform_read_preview")}
                </Button>
              </DialogFooter>
            </>
          ) : null}

          {step === "preview" ? (
            <>
              <DialogHeader>
                <DialogTitle>{t("platform_import_preview")}</DialogTitle>
                <DialogDescription>
                  {t("platform_import_count_start")}
                  {rows.length}
                  {t("platform_import_count_end")}
                </DialogDescription>
              </DialogHeader>
              {target ? (
                <p className="text-sm text-muted-foreground">
                  {t("platform_import_target")}
                  {target.label}
                </p>
              ) : null}
              <div className="max-h-[50dvh] overflow-auto rounded-lg border">
                <table className="w-full min-w-2xl text-left text-sm">
                  <thead className="sticky top-0 bg-muted/95 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">
                        {t("platform_seat_name")}
                      </th>
                      <th className="px-3 py-2 font-medium">
                        {t("platform_seat_short_name")}
                      </th>
                      <th className="px-3 py-2 font-medium">
                        {t("platform_seat_type")}
                      </th>
                      <th className="px-3 py-2 font-medium">
                        {t("platform_matched_role")}
                      </th>
                      <th className="px-3 py-2 font-medium">
                        {t("platform_veto_rights")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={`${row.name}-${index}`} className="border-t">
                        <td className="px-3 py-2">
                          {row.name || t("platform_empty")}
                        </td>
                        <td className="px-3 py-2">{row.shortName || "—"}</td>
                        <td className="px-3 py-2">
                          {row.roleName || t("platform_automatic_match")}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {roleLabel(row.roleName ?? "", activeTarget) ===
                          "unmatched"
                            ? t("platform_unmatched_role")
                            : roleLabel(row.roleName ?? "", activeTarget)}
                        </td>
                        <td className="px-3 py-2">
                          {row.hasVetoPower
                            ? t("platform_yes")
                            : t("platform_no")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {hasUnmatchedRole ? (
                <p role="alert" className="text-sm text-destructive">
                  {t("platform_unmatched_roles_hint")}
                </p>
              ) : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close}>
                  {t("platform_cancel")}
                </Button>
                <Button
                  type="button"
                  disabled={rows.length === 0 || disabled}
                  onClick={confirmImport}
                >
                  {t("platform_confirm_import")}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
