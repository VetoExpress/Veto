"use client"
import { message } from "@/i18n/messages"
import { usePlatformTranslations } from "@/components/i18n-provider"

import { useCallback, useEffect, useState } from "react"
import type { JSX } from "react"
import { Loader2, Save } from "lucide-react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"

import { CommitteeForm } from "@/components/committee-form"
import { PlatformLoading, PlatformShell } from "@/components/platform-shell"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ConferenceApiError,
  type CommitteeInput,
  type Conference,
  getConference,
  replaceConferenceStructure,
} from "@/lib/conference-client"
import { committeeReference, createCommittee } from "@/lib/conference-structure"
import { usePlatformAuth } from "@/lib/use-platform-auth"
import { cn } from "@/lib/utils"

export default function CommitteeDetailPage(): JSX.Element {
  const { t, locale } = usePlatformTranslations()

  const params = useParams<{ id: string; committeeId: string }>()
  const router = useRouter()
  const { token, isReady, signOut } = usePlatformAuth()
  const [conference, setConference] = useState<Conference>()
  const [committee, setCommittee] = useState<CommitteeInput>()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")
  const isNew = params.committeeId === "new"

  const handleError = useCallback(
    (caught: unknown, fallback: string): void => {
      if (caught instanceof ConferenceApiError && caught.status === 401) {
        signOut()
        return
      }
      if (
        caught instanceof ConferenceApiError &&
        caught.code === "CONFERENCE_VERSION_CONFLICT"
      ) {
        setError("platform_committee_version_conflict")
        return
      }
      setError(caught instanceof Error ? caught.message : fallback)
    },
    [signOut]
  )

  const load = useCallback(async (): Promise<void> => {
    if (!token || !params.id || !params.committeeId) return
    setIsLoading(true)
    setError("")
    try {
      const next = await getConference(token, params.id)
      const nextCommittee = isNew
        ? createCommittee()
        : next.committees.find(
            (item, index) =>
              committeeReference(item, index) === params.committeeId
          )
      setConference(next)
      setCommittee(nextCommittee)
      if (!nextCommittee) setError("platform_committee_deleted")
    } catch (caught) {
      handleError(caught, message("platform_load_committee_failed"))
    } finally {
      setIsLoading(false)
    }
  }, [handleError, isNew, params.committeeId, params.id, token])

  useEffect(() => {
    void load()
  }, [load])

  async function save(): Promise<void> {
    if (
      !token ||
      !conference ||
      conference.lifecycle === "closed" ||
      !committee ||
      isSaving
    )
      return
    if (!committee.name.trim()) {
      setError("platform_committee_name_empty")
      return
    }
    if (committee.seats.length === 0) {
      setError("platform_committee_needs_seat")
      return
    }

    setIsSaving(true)
    setError("")
    try {
      const committees = isNew
        ? [...conference.committees, committee]
        : conference.committees.map((item, index) =>
            committeeReference(item, index) === params.committeeId
              ? committee
              : item
          )
      await replaceConferenceStructure(
        token,
        conference.id,
        conference.version,
        {
          roleTemplates: conference.roleTemplates,
          committees,
        }
      )
      router.replace(`/conferences/${conference.id}`)
    } catch (caught) {
      handleError(caught, message("platform_save_committee_failed"))
      setIsSaving(false)
    }
  }

  if (!isReady || isLoading) {
    return <PlatformLoading label={t("platform_loading_committee")} />
  }

  const backHref = `/conferences/${params.id}`

  return (
    <PlatformShell
      backHref={backHref}
      backLabel={t("platform_back_conference")}
    >
      {!conference || !committee ? (
        <div className="mx-auto max-w-xl rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">
            {error || t("platform_committee_inaccessible")}
          </p>
          <Link
            href={backHref}
            className={cn(buttonVariants({ variant: "outline" }), "mt-5")}
          >
            {t("platform_back_conference")}
          </Link>
        </div>
      ) : conference.lifecycle === "closed" ? (
        <div className="mx-auto max-w-xl rounded-xl border bg-muted/30 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            {t("platform_closed_committee_readonly")}
          </p>
          <Link
            href={backHref}
            className={cn(buttonVariants({ variant: "outline" }), "mt-5")}
          >
            {t("platform_back_conference")}
          </Link>
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
          <header className="flex flex-col gap-4 border-b pb-8 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <Badge variant="secondary">
                {isNew
                  ? t("platform_new_committee")
                  : t("platform_seat_count", {
                      value1: committee.seats.length,
                    })}
              </Badge>
              <h1 className="mt-3 min-w-0 text-3xl font-bold tracking-[-0.035em] break-words sm:text-4xl">
                {committee.name.trim() || t("platform_create_committee")}
              </h1>
              <p className="mt-3 text-sm text-muted-foreground">
                {conference.name}
              </p>
            </div>
          </header>

          {error ? (
            <div
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
            >
              {error}
            </div>
          ) : null}

          <Card className="shadow-none ring-0">
            <CardHeader>
              <CardTitle className="text-xl">
                {t("platform_committee_settings")}
              </CardTitle>
              <p className="text-sm leading-6 text-muted-foreground">
                {t("platform_committee_settings_intro")}
              </p>
            </CardHeader>
            <CardContent>
              <CommitteeForm
                value={committee}
                roles={conference.roleTemplates}
                disabled={isSaving}
                allowExistingRemoval={conference.lifecycle === "draft"}
                onChange={setCommittee}
              />
            </CardContent>
          </Card>

          <div className="flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:justify-end">
            <Link
              href={backHref}
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              {t("platform_cancel")}
            </Link>
            <Button
              type="button"
              size="lg"
              disabled={isSaving}
              onClick={() => void save()}
            >
              {isSaving ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Save aria-hidden="true" />
              )}
              {t("platform_save_committee")}
            </Button>
          </div>
        </div>
      )}
    </PlatformShell>
  )
}
