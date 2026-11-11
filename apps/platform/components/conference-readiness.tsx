"use client"
import { message } from "@/i18n/messages"
import { usePlatformTranslations } from "@/components/i18n-provider"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import type { Conference } from "@/lib/conference-client"
import { conferenceReadiness } from "@/lib/conference-readiness"

export function ConferenceReadiness({
  conference,
  hasUnsavedChanges,
  onNavigate,
}: {
  conference: Conference
  hasUnsavedChanges: boolean
  onNavigate: (tab: string) => void
}) {
  const { t, locale } = usePlatformTranslations()

  const checks = conferenceReadiness(conference, locale)
  const remaining = checks.filter((check) => !check.ready).length
  return (
    <section className="space-y-5" aria-labelledby="readiness-heading">
      <div>
        <h2 id="readiness-heading" className="text-xl font-semibold">
          {t("platform_readiness")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {conference.lifecycle === "closed"
            ? t("platform_closed_readiness")
            : remaining
              ? t("platform_remaining_checks", { value1: remaining })
              : t("platform_configuration_ready")}
          {t("platform_readiness_attendance_hint")}
        </p>
      </div>
      {hasUnsavedChanges && (
        <p role="status" className="rounded-lg border p-3 text-sm">
          {t("platform_readiness_unsaved")}
        </p>
      )}
      <ul className="divide-y rounded-xl border">
        {checks.map((check) => (
          <li
            key={check.id}
            className="flex flex-wrap items-center justify-between gap-3 p-4"
          >
            <div>
              <p className="font-medium">
                {check.ready
                  ? t("platform_ready")
                  : t("platform_needs_checking")}{" "}
                {check.label.startsWith("platform_")
                  ? t(check.label)
                  : check.label}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {check.detail.startsWith("platform_")
                  ? t(check.detail)
                  : check.detail}
              </p>
            </div>
            {check.committeeId ? (
              <Link
                className="text-sm underline underline-offset-4"
                href={`/conferences/${conference.id}/committees/${check.committeeId}`}
              >
                {t("platform_view_committee")}
              </Link>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigate(check.target)}
              >
                {t("platform_go_to")}
                {check.target === "seats"
                  ? t("platform_seat_overview")
                  : t("platform_conference_settings")}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
