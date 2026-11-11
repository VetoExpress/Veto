"use client"
import { message } from "@/i18n/messages"
import { usePlatformTranslations } from "@/components/i18n-provider"

import { useCallback, useEffect, useState } from "react"
import { Loader2, TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  closeConference,
  getConference,
  listOrganizerFiles,
  type Conference,
} from "@/lib/conference-client"

interface Props {
  token: string
  conferenceId: string
  lifecycle: "draft" | "active" | "closed"
  version: number
  onConferenceChange: (conference: Conference) => void
  onError: (error: unknown, fallback: string) => void
}

export function ConferenceCloseCard({
  token,
  conferenceId,
  lifecycle,
  version,
  onConferenceChange,
  onError,
}: Props) {
  const { t, locale } = usePlatformTranslations()

  const [pendingCount, setPendingCount] = useState(0)
  const [closing, setClosing] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const loadPendingCount = useCallback(async () => {
    if (lifecycle !== "closed") return
    try {
      const { files } = await listOrganizerFiles(token, conferenceId)
      setPendingCount(
        files.filter((item) => item.status === "submitted").length
      )
    } catch {
      setPendingCount(0)
    }
  }, [conferenceId, lifecycle, token])

  useEffect(() => {
    void loadPendingCount()
  }, [loadPendingCount])

  async function close(): Promise<void> {
    if (closing) return
    setClosing(true)
    try {
      onConferenceChange(await closeConference(token, conferenceId, version))
    } catch (error) {
      onError(error, "platform_close_failed")
      try {
        onConferenceChange(
          await getConference(token, conferenceId, { refresh: true })
        )
      } catch {
        /* The original error remains visible. */
      }
    } finally {
      setClosing(false)
    }
  }

  if (lifecycle === "draft") return null
  if (lifecycle === "closed" && pendingCount === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {t("platform_close_conference")}
        </CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">
          {t("platform_close_conference_hint")}
        </p>
      </CardHeader>
      <CardContent>
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogTrigger
            render={
              <Button type="button" variant="destructive" className="w-full" />
            }
          >
            {closing && <Loader2 className="animate-spin" aria-hidden="true" />}
            {lifecycle === "active"
              ? t("platform_close_conference")
              : t("platform_retry_cleanup")}
          </DialogTrigger>
          <DialogContent showCloseButton={false}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <TriangleAlert
                  className="size-5 text-destructive"
                  aria-hidden="true"
                />
                {t("platform_confirm")}
                {lifecycle === "active"
                  ? t("platform_close_conference")
                  : t("platform_retry_cleanup")}
                ？
              </DialogTitle>
              <DialogDescription>
                {t("platform_close_files_hint")}
                <br />
                {t("platform_irreversible")}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={closing}
                onClick={() => setConfirmOpen(false)}
              >
                {t("platform_cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={closing}
                onClick={() => {
                  setConfirmOpen(false)
                  void close()
                }}
              >
                {closing && (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                )}
                {t("platform_confirm_close")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
