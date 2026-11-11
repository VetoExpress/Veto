"use client"
import { message } from "@/i18n/messages"
import { usePlatformTranslations } from "@/components/i18n-provider"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  Loader2,
  RefreshCw,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  ConferenceApiError,
  downloadOrganizerFile,
  listOrganizerFiles,
  listOrganizerFileTypes,
  withdrawOrganizerFile,
  type OrganizerFile,
} from "@/lib/conference-client"

import { filesExpired, formatSchedule } from "@/lib/conference-schedule"

interface Props {
  filesExpireAt?: string | null
  filesExpiredAt?: string | null
  token: string
  conferenceId: string
  lifecycle: "draft" | "active" | "closed"
  onError: (error: unknown, fallback: string) => void
}

export function ConferenceFilesWorkspace({
  filesExpireAt,
  filesExpiredAt,
  token,
  conferenceId,
  lifecycle,
  onError,
}: Props) {
  const { t, locale } = usePlatformTranslations()

  const [now, setNow] = useState(() => Date.now())
  const [expiredByServer, setExpiredByServer] = useState(false)
  const expired =
    expiredByServer || filesExpired(filesExpireAt, filesExpiredAt, now)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const [files, setFiles] = useState<OrganizerFile[]>([])
  const [fileTypes, setFileTypes] = useState<string[]>([])
  const [selectedType, setSelectedType] = useState("")
  const [loading, setLoading] = useState(false)
  const [withdrawId, setWithdrawId] = useState<string>()
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [sortKey, setSortKey] = useState<
    "fileType" | "createdAt" | "author" | "fileName"
  >("createdAt")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")
  const statusLabel: Record<OrganizerFile["status"], string> = {
    submitted: "platform_pending_review",
    published: "platform_published",
    rejected: "platform_returned",
    cancelled: "platform_cancelled",
    withdrawn: "platform_withdrawn",
  }
  const loadSequence = useRef(0)

  function scopeLabel(item: OrganizerFile): string {
    const scope =
      item.status === "submitted" ? item.requestedVisibility : item.visibility
    return `${item.status === "submitted" ? t("platform_requested_prefix") : ""}${scope === "conference" ? t("platform_whole_conference") : t("platform_this_committee")}`
  }

  const sortedFiles = [...files].sort((a, b) => {
    const compare =
      sortKey === "createdAt"
        ? Date.parse(a.createdAt) - Date.parse(b.createdAt)
        : sortKey === "author"
          ? `${a.author.committeeName} / ${a.author.seatName}`.localeCompare(
              `${b.author.committeeName} / ${b.author.seatName}`,
              locale,
              { numeric: true }
            )
          : a[sortKey].localeCompare(b[sortKey], locale, { numeric: true })
    return (
      (sortDirection === "asc" ? compare : -compare) || a.id.localeCompare(b.id)
    )
  })

  function sortBy(key: typeof sortKey): void {
    if (sortKey === key)
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
    else {
      setSortKey(key)
      setSortDirection(key === "createdAt" ? "desc" : "asc")
    }
  }

  const load = useCallback(async () => {
    if (lifecycle === "draft") return
    const sequence = ++loadSequence.current
    setLoading(true)
    try {
      const [result, types] = await Promise.all([
        listOrganizerFiles(
          token,
          conferenceId,
          true,
          selectedType || undefined
        ),
        listOrganizerFileTypes(token, conferenceId, true),
      ])
      if (sequence !== loadSequence.current) return
      setFiles(result.files)
      setFileTypes(types.fileTypes)
    } catch (error) {
      if (sequence === loadSequence.current)
        onError(error, "platform_load_files_failed")
    } finally {
      if (sequence === loadSequence.current) setLoading(false)
    }
  }, [conferenceId, lifecycle, onError, selectedType, token])

  useEffect(() => {
    void load()
  }, [load])

  async function withdraw(item: OrganizerFile): Promise<void> {
    if (!reason.trim() || busy) return
    setBusy(true)
    try {
      await withdrawOrganizerFile(token, conferenceId, item.id, reason.trim())
      setWithdrawId(undefined)
      setReason("")
      await load()
    } catch (error) {
      onError(error, "platform_withdraw_file_failed")
    } finally {
      setBusy(false)
    }
  }

  async function download(item: OrganizerFile): Promise<void> {
    if (
      filesExpired(filesExpireAt, filesExpiredAt) ||
      expiredByServer ||
      item.objectDeletedAt
    )
      return
    try {
      await downloadOrganizerFile(token, conferenceId, item)
    } catch (error) {
      if (error instanceof ConferenceApiError && error.code === "FILES_EXPIRED")
        setExpiredByServer(true)
      onError(error, "platform_download_failed")
    }
  }

  if (lifecycle === "draft") {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          {t("platform_draft_files_hint")}
        </CardContent>
      </Card>
    )
  }

  return (
    <section className="space-y-4">
      <div
        role="status"
        className="rounded-lg border bg-muted/40 p-4 text-sm leading-6"
      >
        {expired
          ? t("platform_files_expired_hint")
          : filesExpireAt
            ? t("platform_files_deadline_hint", {
                value1: formatSchedule(filesExpireAt, locale),
              })
            : t("platform_files_no_deadline_hint")}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">{t("platform_file_management")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("platform_files_intro")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor="organizer-file-type"
            className="text-sm text-muted-foreground"
          >
            {t("platform_file_type")}
          </label>
          <select
            id="organizer-file-type"
            value={selectedType}
            onChange={(event) => setSelectedType(event.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">{t("platform_all_types")}</option>
            {fileTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => void load()}
          >
            {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {t("platform_refresh")}
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-3 font-medium">{t("platform_title")}</th>
              {(
                [
                  { key: "fileType", label: t("platform_type") },
                  { key: "createdAt", label: t("platform_time") },
                  { key: "author", label: t("platform_uploader") },
                  { key: "fileName", label: t("platform_file_name") },
                ] as const
              ).map((column) => (
                <th
                  key={column.key}
                  aria-sort={
                    sortKey === column.key
                      ? sortDirection === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                  className="px-3 py-3 font-medium"
                >
                  <button
                    className="inline-flex items-center gap-1 hover:text-foreground"
                    onClick={() => sortBy(column.key)}
                    aria-label={t("platform_sort_by", {
                      value1: t(column.label),
                    })}
                  >
                    {t(column.label)}
                    {sortKey === column.key ? (
                      sortDirection === "asc" ? (
                        <ArrowUp className="size-3.5" />
                      ) : (
                        <ArrowDown className="size-3.5" />
                      )
                    ) : (
                      <ArrowUpDown className="size-3.5" />
                    )}
                  </button>
                </th>
              ))}
              <th className="px-3 py-3 font-medium">
                {t("platform_visibility")}
              </th>
              <th className="px-3 py-3 font-medium">{t("platform_status")}</th>
              <th className="px-3 py-3 text-right font-medium">
                {t("platform_actions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedFiles.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-10 text-center text-muted-foreground"
                >
                  {loading
                    ? t("platform_loading_files")
                    : t("platform_no_files")}
                </td>
              </tr>
            ) : (
              sortedFiles.map((item) => (
                <tr
                  key={item.id}
                  className="border-b last:border-0 hover:bg-muted/50"
                >
                  <td className="min-w-40 px-3 py-3 align-middle font-medium">
                    {item.title}
                    {item.replacesFileId && (
                      <p className="mt-1 text-xs font-normal text-muted-foreground">
                        {t("platform_resubmitted")}
                        {item.replacesFileId}
                      </p>
                    )}
                    {item.reviewNote && (
                      <p
                        className={`mt-1 max-w-56 text-xs font-normal ${item.status === "rejected" ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        {t("platform_review_note")}
                        {item.reviewNote}
                      </p>
                    )}
                    {item.withdrawalReason && (
                      <p className="mt-1 max-w-56 text-xs font-normal text-destructive">
                        {t("platform_withdrawal_reason_prefix")}
                        {item.withdrawalReason}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3">{item.fileType}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {new Date(item.createdAt).toLocaleString(locale)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {item.author.committeeName} / {item.author.seatName}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {item.fileName}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {(item.size / 1024).toFixed(1)} KiB
                    </span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {scopeLabel(item)}
                  </td>
                  <td className="px-3 py-3">
                    <Badge
                      variant={
                        item.status === "published" ? "default" : "secondary"
                      }
                    >
                      {t(statusLabel[item.status])}
                      {item.objectDeletedAt
                        ? t("platform_content_deleted_suffix")
                        : expired
                          ? t("platform_expired_suffix")
                          : ""}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 text-right">
                    {item.status === "published" && (
                      <>
                        <div className="flex justify-end gap-2">
                          {lifecycle === "active" && withdrawId !== item.id && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                setWithdrawId(item.id)
                                setReason("")
                              }}
                            >
                              {t("platform_withdraw")}
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={expired || Boolean(item.objectDeletedAt)}
                            onClick={() => void download(item)}
                          >
                            <Download />
                            {t("platform_download")}
                          </Button>
                        </div>
                        {lifecycle === "active" && withdrawId === item.id && (
                          <div className="mt-2 flex min-w-56 flex-col gap-2 text-left">
                            <Label htmlFor={`file-withdraw-${item.id}`}>
                              {t("platform_withdrawal_reason")}
                            </Label>
                            <input
                              id={`file-withdraw-${item.id}`}
                              value={reason}
                              maxLength={500}
                              onChange={(event) =>
                                setReason(event.target.value)
                              }
                              className="rounded-md border border-input bg-transparent p-2 text-sm"
                            />
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() => {
                                  setWithdrawId(undefined)
                                  setReason("")
                                }}
                              >
                                {t("platform_cancel")}
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                disabled={busy || !reason.trim()}
                                onClick={() => void withdraw(item)}
                              >
                                {t("platform_confirm_withdraw")}
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
