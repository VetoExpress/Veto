"use client"
import { usePlatformTranslations } from "@/components/i18n-provider"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  FILE_RETENTION_MS,
  formatSchedule,
  scheduleError,
  scheduleInstant,
} from "@/lib/conference-schedule"

export function ConferenceScheduleFields({
  startsAt,
  endsAt,
  onStartChange,
  onEndChange,
  disabled = false,
}: {
  startsAt: string
  endsAt: string
  onStartChange: (value: string) => void
  onEndChange: (value: string) => void
  disabled?: boolean
}) {
  const { t, locale } = usePlatformTranslations()

  const error = scheduleError(startsAt, endsAt, locale)
  const deadline =
    !error && endsAt
      ? new Date(
          Date.parse(scheduleInstant(endsAt)!) + FILE_RETENTION_MS
        ).toISOString()
      : null
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-3">
      <legend className="mb-2 text-sm font-medium">
        {t("platform_schedule_legend")}
      </legend>
      <p className="text-xs text-muted-foreground">
        {t("platform_schedule_hint")}
      </p>
      <Label htmlFor="conference-starts-at">
        {t("platform_start_time")}
        <span className="text-destructive"> *</span>
      </Label>
      <Input
        id="conference-starts-at"
        type="datetime-local"
        step="0.001"
        value={startsAt}
        required
        aria-invalid={!startsAt || (Boolean(error) && Boolean(endsAt))}
        aria-describedby="conference-schedule-help"
        onChange={(event) => onStartChange(event.target.value)}
      />
      <Label htmlFor="conference-ends-at">
        {t("platform_end_time")}
        <span className="text-destructive"> *</span>
      </Label>
      <Input
        id="conference-ends-at"
        type="datetime-local"
        step="0.001"
        value={endsAt}
        required
        aria-invalid={Boolean(error)}
        aria-describedby="conference-schedule-help"
        onChange={(event) => onEndChange(event.target.value)}
      />
      <p
        id="conference-schedule-help"
        className={
          error ? "text-sm text-destructive" : "text-xs text-muted-foreground"
        }
      >
        {error ||
          (deadline
            ? t("platform_schedule_cleanup_deadline", {
                value1: formatSchedule(deadline, locale),
              })
            : t("platform_schedule_cleanup_hint"))}
      </p>
    </fieldset>
  )
}
