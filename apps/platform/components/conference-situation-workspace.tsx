"use client"
import { message } from "@/i18n/messages"
import { usePlatformTranslations } from "@/components/i18n-provider"
import type { Locale } from "@/i18n/locale"

import { useCallback, useEffect, useState } from "react"
import { Clock3, Loader2, Play, RefreshCw, RotateCcw } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  type Conference,
  type OrganizerSituation,
  activateConference,
  configureConferenceRuntime,
  listOrganizerSituations,
  withdrawOrganizerSituation,
} from "@/lib/conference-client"

interface Props {
  token: string
  conference: Conference
  hasUnsavedStructure?: boolean
  settingsOnly?: boolean
  onConferenceChange: (conference: Conference) => void
  onError: (error: unknown, fallback: string) => void
}

function toLocalInput(timestamp: number): string {
  const date = new Date(timestamp + 8 * 60 * 60 * 1000)
  return date.toISOString().slice(0, 16)
}

function fromChinaInput(value: string): number {
  return Date.parse(`${value}:00+08:00`)
}

function formatTime(value: number, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Shanghai",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value)
}

export function ConferenceSituationWorkspace({
  token,
  conference,
  hasUnsavedStructure = false,
  settingsOnly = false,
  onConferenceChange,
  onError,
}: Props) {
  const { t, locale } = usePlatformTranslations()

  const [useTimeline, setUseTimeline] = useState(
    conference.timelineMode !== "none"
  )
  const [timelineName, setTimelineName] = useState(
    conference.timeline?.name ?? "大会时间线"
  )
  const [initialTime, setInitialTime] = useState(
    toLocalInput(conference.timeline?.initialSimTime ?? Date.now())
  )
  const [ratio, setRatio] = useState(String(conference.timeline?.ratio ?? 1))
  const [situations, setSituations] = useState<OrganizerSituation[]>([])
  const [busy, setBusy] = useState<
    "runtime" | "activate" | "load" | "withdraw"
  >()

  const loadSituations = useCallback(async () => {
    if (settingsOnly || conference.lifecycle === "draft") return
    setBusy("load")
    try {
      const result = await listOrganizerSituations(token, conference.id, true)
      setSituations(result.situations)
    } catch (error) {
      onError(error, message("platform_load_situations_failed"))
    } finally {
      setBusy(undefined)
    }
  }, [conference.id, conference.lifecycle, onError, settingsOnly, token])

  useEffect(() => {
    void loadSituations()
  }, [loadSituations])

  async function saveRuntime(): Promise<void> {
    const numericRatio = Number(ratio)
    const initialSimTime =
      conference.timeline &&
      initialTime === toLocalInput(conference.timeline.initialSimTime)
        ? conference.timeline.initialSimTime
        : fromChinaInput(initialTime)
    if (
      useTimeline &&
      (!timelineName.trim() ||
        !Number.isSafeInteger(numericRatio) ||
        numericRatio <= 0 ||
        !Number.isSafeInteger(initialSimTime))
    ) {
      onError(
        new Error("platform_timeline_validation"),
        "platform_invalid_timeline"
      )
      return
    }
    setBusy("runtime")
    try {
      const next = await configureConferenceRuntime(
        token,
        conference.id,
        conference.version,
        useTimeline
          ? {
              name: timelineName.trim(),
              initialSimTime,
              ratio: numericRatio,
            }
          : null
      )
      onConferenceChange(next)
    } catch (error) {
      onError(error, "platform_save_runtime_failed")
    } finally {
      setBusy(undefined)
    }
  }

  async function activate(): Promise<void> {
    setBusy("activate")
    try {
      const next = await activateConference(
        token,
        conference.id,
        conference.version
      )
      onConferenceChange(next)
    } catch (error) {
      onError(error, "platform_activate_failed")
    } finally {
      setBusy(undefined)
    }
  }

  async function withdraw(item: OrganizerSituation): Promise<void> {
    const reason = window.prompt(t("platform_withdraw_reason_prompt"))?.trim()
    if (!reason) return
    setBusy("withdraw")
    try {
      await withdrawOrganizerSituation(token, conference.id, item.id, reason)
      await loadSituations()
    } catch (error) {
      onError(error, "platform_withdraw_situation_failed")
    } finally {
      setBusy(undefined)
    }
  }

  if (conference.lifecycle === "draft") {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock3 />
              {t("platform_conference_time")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={useTimeline ? "default" : "outline"}
                onClick={() => setUseTimeline(true)}
              >
                {t("platform_use_timeline")}
              </Button>
              <Button
                type="button"
                variant={!useTimeline ? "default" : "outline"}
                onClick={() => setUseTimeline(false)}
              >
                {t("platform_manual_content_time")}
              </Button>
            </div>
            {useTimeline ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="timeline-name">
                    {t("platform_display_name")}
                  </Label>
                  <Input
                    id="timeline-name"
                    value={timelineName}
                    onChange={(event) => setTimelineName(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timeline-start">
                    {t("platform_initial_time")}
                  </Label>
                  <Input
                    id="timeline-start"
                    type="datetime-local"
                    value={initialTime}
                    onChange={(event) => setInitialTime(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timeline-ratio">
                    {t("platform_default_ratio")}
                  </Label>
                  <Input
                    id="timeline-ratio"
                    type="number"
                    min={1}
                    step={1}
                    value={ratio}
                    onChange={(event) => setRatio(event.target.value)}
                  />
                </div>
              </div>
            ) : (
              <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
                {t("platform_manual_content_time_hint")}
              </p>
            )}
            <Button disabled={Boolean(busy)} onClick={() => void saveRuntime()}>
              {busy === "runtime" && <Loader2 className="animate-spin" />}
              {t("platform_save_runtime")}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("platform_activate")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>{t("platform_timeline_activation_hint")}</p>
            <p>{t("platform_default_timezone")}</p>
            {conference.timelineMode === "undecided" ? (
              <p>{t("platform_save_runtime_first")}</p>
            ) : null}
            {hasUnsavedStructure ? (
              <p>{t("platform_save_structure_first")}</p>
            ) : null}
            <Button
              className="w-full"
              disabled={
                conference.timelineMode === "undecided" ||
                hasUnsavedStructure ||
                Boolean(busy)
              }
              onClick={() => void activate()}
            >
              {busy === "activate" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Play />
              )}
              {t("platform_activate")}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (settingsOnly) {
    if (conference.timelineMode !== "configured" || !conference.timeline) {
      return (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            {t("platform_no_timeline_active")}
          </CardContent>
        </Card>
      )
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock3 />
            {t("platform_edit_timeline")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="active-timeline-name">
                {t("platform_display_name")}
              </Label>
              <Input
                id="active-timeline-name"
                value={timelineName}
                onChange={(event) => setTimelineName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="active-timeline-start">
                {t("platform_initial_time")}
              </Label>
              <Input
                id="active-timeline-start"
                type="datetime-local"
                value={initialTime}
                onChange={(event) => setInitialTime(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="active-timeline-ratio">
                {t("platform_ratio")}
              </Label>
              <Input
                id="active-timeline-ratio"
                type="number"
                min={1}
                step={1}
                value={ratio}
                onChange={(event) => setRatio(event.target.value)}
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("platform_timeline_edit_hint")}
          </p>
          <Button disabled={Boolean(busy)} onClick={() => void saveRuntime()}>
            {busy === "runtime" && <Loader2 className="animate-spin" />}
            {t("platform_save_timeline")}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">
            {t("platform_situation_management")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("platform_situations_intro")}
          </p>
        </div>
        <Button
          variant="outline"
          disabled={busy === "load"}
          onClick={() => void loadSituations()}
        >
          <RefreshCw className={busy === "load" ? "animate-spin" : ""} />
          {t("platform_refresh")}
        </Button>
      </div>
      {situations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("platform_no_situations")}
          </CardContent>
        </Card>
      ) : (
        situations.map((item) => (
          <Card key={item.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="font-mono text-base">
                    {formatTime(item.contentTime, locale)}
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.author.committeeName} · {item.author.seatName}
                    {item.author.role ? ` · ${item.author.role}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      item.status === "published" ? "default" : "secondary"
                    }
                  >
                    {item.status === "published"
                      ? t("platform_published")
                      : t("platform_withdrawn")}
                  </Badge>
                  {conference.lifecycle === "active" &&
                    item.status === "published" && (
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={busy === "withdraw"}
                        onClick={() => void withdraw(item)}
                      >
                        <RotateCcw />
                        {t("platform_withdraw")}
                      </Button>
                    )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-sm leading-7 whitespace-pre-wrap">
                {item.content}
              </div>
              {item.withdrawalReason && (
                <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  {t("platform_withdrawal_reason_prefix")}
                  {item.withdrawalReason}
                </p>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </section>
  )
}
