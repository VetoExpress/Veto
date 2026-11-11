"use client"
import { message } from "@/i18n/messages"
import { usePlatformTranslations } from "@/components/i18n-provider"

import { useCallback, useEffect, useState } from "react"
import { Loader2, RefreshCw, RotateCcw } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  type OrganizerDirective,
  listOrganizerDirectives,
  releaseOrganizerDirective,
} from "@/lib/conference-client"

interface Props {
  token: string
  conferenceId: string
  lifecycle: "draft" | "active" | "closed"
  onError: (error: unknown, fallback: string) => void
}

const statusLabel: Record<OrganizerDirective["status"], string> = {
  submitted: "platform_pending",
  processing: "platform_processing",
  approved: "platform_approved",
  rejected: "platform_rejected",
  cancelled: "platform_cancelled",
}

export function ConferenceDirectiveWorkspace({
  token,
  conferenceId,
  lifecycle,
  onError,
}: Props) {
  const { t, locale } = usePlatformTranslations()

  const [directives, setDirectives] = useState<OrganizerDirective[]>([])
  const [loading, setLoading] = useState(false)
  const [releasingId, setReleasingId] = useState<string>()

  const load = useCallback(async () => {
    if (lifecycle === "draft") return
    setLoading(true)
    try {
      const result = await listOrganizerDirectives(token, conferenceId, true)
      setDirectives(result.directives)
    } catch (error) {
      onError(error, "platform_load_directives_failed")
    } finally {
      setLoading(false)
    }
  }, [conferenceId, lifecycle, onError, token])

  useEffect(() => {
    void load()
  }, [load])

  async function release(item: OrganizerDirective): Promise<void> {
    const reason = window.prompt(t("platform_release_reason_prompt"))?.trim()
    if (!reason) return
    setReleasingId(item.id)
    try {
      await releaseOrganizerDirective(token, conferenceId, item.id, reason)
      await load()
    } catch (error) {
      onError(error, "platform_release_failed")
    } finally {
      setReleasingId(undefined)
    }
  }

  if (lifecycle === "draft") {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          {t("platform_draft_directives_hint")}
        </CardContent>
      </Card>
    )
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold">
            {t("platform_directive_management")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("platform_directives_intro")}
          </p>
        </div>
        <Button
          variant="outline"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {t("platform_refresh")}
        </Button>
      </div>
      {directives.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("platform_no_directives")}
          </CardContent>
        </Card>
      ) : (
        directives.map((item) => (
          <Card key={item.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle className="text-base">{item.title}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {item.author.committeeName} · {item.author.seatName} →{" "}
                    {item.targetCommitteeName} ·{" "}
                    {t("platform_revision", { revision: item.revision })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString(locale)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      item.status === "processing" ? "default" : "secondary"
                    }
                  >
                    {t(statusLabel[item.status])}
                  </Badge>
                  {lifecycle === "active" && item.status === "processing" && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={Boolean(releasingId)}
                      onClick={() => void release(item)}
                    >
                      {releasingId === item.id ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <RotateCcw />
                      )}
                      {t("platform_release_claim")}
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="leading-7 whitespace-pre-wrap">
                {item.content}
              </div>
              {item.claimedBySeatId && (
                <p className="text-muted-foreground">
                  {t("platform_claimed_seat")}
                  {item.claimedBySeatId}
                </p>
              )}
              {item.processingNote && (
                <p className="rounded-lg bg-muted p-3">
                  {t("platform_processing_note")}
                  {item.processingNote}
                </p>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </section>
  )
}
