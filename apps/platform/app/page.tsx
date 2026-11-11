"use client"
import { message } from "@/i18n/messages"
import { usePlatformTranslations } from "@/components/i18n-provider"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ArchiveRestore, Cloud, Loader2, Plus, RotateCw } from "lucide-react"
import Link from "next/link"

import { ConferenceCard } from "@/components/conference-card"
import { PlatformLoading, PlatformShell } from "@/components/platform-shell"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ConferenceApiError,
  type ConferenceSummary,
  listConferences,
  restoreConference,
} from "@/lib/conference-client"
import { usePlatformAuth } from "@/lib/use-platform-auth"
import { cn } from "@/lib/utils"

export default function PlatformHome() {
  const { t, locale } = usePlatformTranslations()
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    [locale]
  )

  const { token, isReady, signOut } = usePlatformAuth()
  const [conferences, setConferences] = useState<ConferenceSummary[]>([])
  const [deletedConferences, setDeletedConferences] = useState<
    ConferenceSummary[]
  >([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [restoringId, setRestoringId] = useState<string>()
  const [error, setError] = useState("")

  const handleError = useCallback(
    (caught: unknown) => {
      if (caught instanceof ConferenceApiError && caught.status === 401) {
        signOut()
        return
      }
      setError(
        caught instanceof Error
          ? caught.message
          : message("platform_load_conference_failed")
      )
    },
    [signOut]
  )

  const loadConferences = useCallback(
    async (refresh = false) => {
      if (!token) return
      setIsLoading(true)
      setError("")
      try {
        const [active, deleted] = await Promise.all([
          listConferences(token, { status: "active", limit: 20, refresh }),
          listConferences(token, { status: "deleted", limit: 100, refresh }),
        ])
        setConferences(active.conferences)
        setNextCursor(active.nextCursor)
        setDeletedConferences(deleted.conferences)
      } catch (caught) {
        handleError(caught)
      } finally {
        setIsLoading(false)
      }
    },
    [handleError, token]
  )

  useEffect(() => {
    void loadConferences()
  }, [loadConferences])

  async function loadMore() {
    if (!token || !nextCursor || isLoadingMore) return
    setIsLoadingMore(true)
    try {
      const result = await listConferences(token, {
        status: "active",
        cursor: nextCursor,
        limit: 20,
      })
      setConferences((current) => [...current, ...result.conferences])
      setNextCursor(result.nextCursor)
    } catch (caught) {
      handleError(caught)
    } finally {
      setIsLoadingMore(false)
    }
  }

  async function restore(item: ConferenceSummary) {
    if (!token || restoringId) return
    setRestoringId(item.id)
    setError("")
    try {
      await restoreConference(token, item.id, item.version)
      await loadConferences()
    } catch (caught) {
      handleError(caught)
    } finally {
      setRestoringId(undefined)
    }
  }

  if (!isReady) return <PlatformLoading />

  return (
    <PlatformShell>
      <section aria-labelledby="conference-list" className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2
              id="conference-list"
              className="text-lg font-semibold tracking-tight"
            >
              {t("platform_my_conferences")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("platform_recently_updated_order")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/conferences/new"
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-11 rounded-full px-5"
              )}
            >
              <Plus data-icon="inline-start" aria-hidden="true" />
              {t("platform_create_cloud_conference")}
            </Link>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              disabled={isLoading}
              onClick={() => {
                void loadConferences(true)
              }}
            >
              <RotateCw />
            </Button>
          </div>
        </div>

        {error ? (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          >
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <Card className="min-h-80 bg-card/70 shadow-none ring-0">
            <CardContent className="grid flex-1 place-items-center">
              <Loader2
                className="animate-spin text-muted-foreground"
                aria-label={t("platform_loading_conference")}
              />
            </CardContent>
          </Card>
        ) : conferences.length === 0 ? (
          <Card className="min-h-80 border-dashed bg-card/70 shadow-none ring-0">
            <CardContent className="grid flex-1 place-items-center px-6 py-14">
              <div className="flex w-full max-w-sm flex-col items-center text-center">
                <span className="mb-5 grid size-12 place-items-center rounded-xl border bg-background shadow-sm">
                  <Cloud className="size-5" aria-hidden="true" />
                </span>
                <CardHeader className="w-full justify-items-center text-center">
                  <CardTitle className="text-lg">
                    {t("platform_no_cloud_conferences")}
                  </CardTitle>
                  <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                    {t("platform_conference_list_empty_hint")}
                  </p>
                </CardHeader>
                <Link
                  href="/conferences/new"
                  className={cn(buttonVariants(), "mt-5 rounded-full px-4")}
                >
                  <Plus aria-hidden="true" />
                  {t("platform_create_first_conference")}
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {conferences.map((conference) => (
              <ConferenceCard key={conference.id} conference={conference} />
            ))}
          </div>
        )}

        {nextCursor ? (
          <div className="flex justify-center pt-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              disabled={isLoadingMore}
              onClick={() => void loadMore()}
            >
              {isLoadingMore ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : null}
              {t("platform_load_more")}
            </Button>
          </div>
        ) : null}
      </section>

      {deletedConferences.length > 0 ? (
        <section className="space-y-4 pt-14" aria-labelledby="deleted-list">
          <div>
            <h2
              id="deleted-list"
              className="text-lg font-semibold tracking-tight"
            >
              {t("platform_recently_deleted")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("platform_restore_invites_hint")}
            </p>
          </div>
          <div className="divide-y rounded-xl border bg-card/70">
            {deletedConferences.map((conference) => (
              <div
                key={conference.id}
                className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{conference.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("platform_deleted_at")}{" "}
                    {dateFormatter.format(
                      new Date(conference.deletedAt ?? conference.updatedAt)
                    )}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={Boolean(restoringId)}
                  onClick={() => void restore(conference)}
                >
                  {restoringId === conference.id ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : (
                    <ArchiveRestore aria-hidden="true" />
                  )}
                  {t("platform_restore")}
                </Button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </PlatformShell>
  )
}
