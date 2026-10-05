"use client"

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
  if (error.code === "empty_workbook") return "文件中没有可读取的 Sheet"
  if (error.code === "sheet_not_found") return "找不到所选 Sheet"
  if (error.code === "no_valid_rows") return fallback
  return fallback
}

export function SeatImportDialog({
  disabled = false,
  target,
  roleLabel,
  onImport,
}: SeatImportDialogProps): JSX.Element {
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
      row.roleName && roleLabel(row.roleName, activeTarget) === "未匹配角色"
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
      setError(errorMessage(cause, "Excel 文件读取失败"))
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
      setError(errorMessage(cause, "没有读取到有效数据，请检查表格内容"))
    }
  }

  function readText(): void {
    try {
      setRows(parseSeatText(text, "conference"))
      setError("")
      setStep("preview")
    } catch (cause) {
      setRows([])
      setError(errorMessage(cause, "没有读取到有效数据，请按格式逐行输入"))
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
        <FileSpreadsheet aria-hidden="true" />从 Excel 导入
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => openFormat("text")}
      >
        <FileText aria-hidden="true" />
        从文本导入
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
                  {mode === "excel" ? "从 Excel 导入席位" : "从文本导入席位"}
                </DialogTitle>
                <DialogDescription>
                  开始读取前，请确认导入内容符合以下格式。
                </DialogDescription>
              </DialogHeader>

              {mode === "excel" ? (
                <div className="flex flex-col gap-3 text-sm text-muted-foreground">
                  <p>第一行作为表头，从第二行开始读取：</p>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full min-w-lg text-sm">
                      <thead className="bg-muted/50 text-left text-xs">
                        <tr>
                          <th className="px-3 py-2 font-medium">A 列</th>
                          <th className="px-3 py-2 font-medium">
                            B 列（可选）
                          </th>
                          <th className="px-3 py-2 font-medium">
                            C 列（可选）
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-t text-foreground">
                          <td className="px-3 py-2">席位名称</td>
                          <td className="px-3 py-2">席位简称</td>
                          <td className="px-3 py-2">席位类型（角色名称）</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p>选择文件后还需要选择要读取的 Sheet。</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                  <p>每行一个席位，格式为：</p>
                  <code className="rounded-lg bg-muted px-3 py-2 text-foreground">
                    席位名称[,席位简称][,席位类型]
                  </code>
                  <p>
                    席位简称和席位类型都可以省略；需要跳过简称填写类型时，请保留空字段，例如：席位名称,,席位类型。
                  </p>
                  <p>分隔符支持逗号、中文逗号、分号、中文分号和 |。</p>
                </div>
              )}

              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close}>
                  取消
                </Button>
                <Button type="button" onClick={continueFromFormat}>
                  <Upload aria-hidden="true" />
                  {mode === "excel" ? "选择文件" : "继续输入"}
                </Button>
              </DialogFooter>
            </>
          ) : null}

          {step === "text" ? (
            <>
              <DialogHeader>
                <DialogTitle>粘贴文本席位</DialogTitle>
                <DialogDescription>
                  每行一个席位，支持逗号、分号或 | 分隔。
                </DialogDescription>
              </DialogHeader>
              <textarea
                className="min-h-56 resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={text}
                placeholder="席位名称[,席位简称][,席位类型]"
                aria-label="席位文本"
                onChange={(event) => setText(event.target.value)}
              />
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close}>
                  取消
                </Button>
                <Button
                  type="button"
                  disabled={!text.trim()}
                  onClick={readText}
                >
                  读取并预览
                </Button>
              </DialogFooter>
            </>
          ) : null}

          {step === "sheet" ? (
            <>
              <DialogHeader>
                <DialogTitle>选择 Sheet</DialogTitle>
                <DialogDescription>
                  请选择要读取的工作表，第一行将作为表头跳过。
                </DialogDescription>
              </DialogHeader>
              <select
                className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={selectedSheet}
                aria-label="工作表"
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
                  {error}
                </p>
              ) : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close}>
                  取消
                </Button>
                <Button
                  type="button"
                  disabled={!selectedSheet}
                  onClick={readSelectedSheet}
                >
                  读取并预览
                </Button>
              </DialogFooter>
            </>
          ) : null}

          {step === "preview" ? (
            <>
              <DialogHeader>
                <DialogTitle>导入数据预览</DialogTitle>
                <DialogDescription>
                  确认后将把以下 {rows.length} 条席位追加到当前委员会。
                </DialogDescription>
              </DialogHeader>
              {target ? (
                <p className="text-sm text-muted-foreground">
                  导入到：{target.label}
                </p>
              ) : null}
              <div className="max-h-[50dvh] overflow-auto rounded-lg border">
                <table className="w-full min-w-2xl text-left text-sm">
                  <thead className="sticky top-0 bg-muted/95 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">席位名称</th>
                      <th className="px-3 py-2 font-medium">席位简称</th>
                      <th className="px-3 py-2 font-medium">席位类型</th>
                      <th className="px-3 py-2 font-medium">匹配角色</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={`${row.name}-${index}`} className="border-t">
                        <td className="px-3 py-2">{row.name || "（空）"}</td>
                        <td className="px-3 py-2">{row.shortName || "—"}</td>
                        <td className="px-3 py-2">
                          {row.roleName || "自动匹配"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {roleLabel(row.roleName ?? "", activeTarget)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {hasUnmatchedRole ? (
                <p role="alert" className="text-sm text-destructive">
                  存在无法匹配到当前委员会的席位类型，导入后请在席位列表中重新选择角色。
                </p>
              ) : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close}>
                  取消
                </Button>
                <Button
                  type="button"
                  disabled={rows.length === 0 || disabled}
                  onClick={confirmImport}
                >
                  确认导入
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
