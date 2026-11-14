/* Hallmark · genre: modern-minimal · macrostructure: Workbench · theme: Coral · designed-as-app */
/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4 */
"use client"
import { message } from "@/i18n/messages"
import { usePlatformTranslations } from "@/components/i18n-provider"

import { useCallback, useEffect, useState } from "react"
import type { JSX } from "react"
import {
  Clock3,
  FileText,
  FolderOpen,
  Loader2,
  Newspaper,
  Radio,
  Save,
  ScrollText,
  Settings2,
  Trash2,
  Users,
} from "lucide-react"
import { useParams, useRouter } from "next/navigation"

import {
  ConferenceStructureEditor,
  textareaClassName,
} from "@/components/conference-structure-editor"
import { ConferenceSeatOverview } from "@/components/conference-seat-overview"
import { ConferenceReadiness } from "@/components/conference-readiness"
import { ConferenceSituationWorkspace } from "@/components/conference-situation-workspace"
import { ConferenceDirectiveWorkspace } from "@/components/conference-directive-workspace"
import { ConferenceNewsWorkspace } from "@/components/conference-news-workspace"
import { ConferenceFilesWorkspace } from "@/components/conference-files-workspace"
import { ConferenceCloseCard } from "@/components/conference-close-card"
import { PlatformLoading, PlatformShell } from "@/components/platform-shell"
import { Badge } from "@/components/ui/badge"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  CONFERENCE_LIFECYCLE_LABELS,
  ConferenceApiError,
  type Conference,
  type ConferenceStructure,
  deleteConference,
  getConference,
  replaceConferenceStructure,
  updateConferenceMetadata,
} from "@/lib/conference-client"
import { ConferenceScheduleFields } from "@/components/conference-schedule-fields"
import {
  scheduleInput,
  scheduleInstant,
  scheduleError,
} from "@/lib/conference-schedule"
import { usePlatformAuth } from "@/lib/use-platform-auth"
import {
  conferenceEdit,
  mergeConferenceEdit,
  sameEditValue,
  editLabels,
  describeEditValue,
  type ConferenceEdit,
} from "@/lib/conference-edit"
import { useUnsavedChanges } from "@/lib/use-unsaved-changes"

type SavingSection = "metadata" | "structure" | "delete" | "review"
const pendingEdits = new Map<
  string,
  { base: ConferenceEdit; local: ConferenceEdit }
>()

export default function ConferenceDetailPage(): JSX.Element {
  const { t, locale } = usePlatformTranslations()

  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { token, isReady, signOut } = usePlatformAuth()
  const [conference, setConference] = useState<Conference>()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [organizer, setOrganizer] = useState("")
  const [startsAt, setStartsAt] = useState("")
  const [endsAt, setEndsAt] = useState("")
  const [structure, setStructure] = useState<ConferenceStructure>({
    roleTemplates: [],
    committees: [],
  })
  const [saving, setSaving] = useState<SavingSection>()
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const [fieldErrors, setFieldErrors] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState("readiness")
  const [editBase, setEditBase] = useState<ConferenceEdit>()
  const [versionConflict, setVersionConflict] = useState(false)
  const [review, setReview] = useState<{
    remote: Conference
    local: ConferenceEdit
    result: ReturnType<typeof mergeConferenceEdit>
  }>()
  const [choices, setChoices] = useState<
    Partial<Record<keyof ConferenceEdit, "local" | "remote">>
  >({})
  const conferenceId = params.id
  const draftKey = `${token}:${conferenceId}`
  const localEdit: ConferenceEdit = {
    name,
    description,
    organizer,
    startsAt,
    endsAt,
    structure,
  }
  const dirty = !!editBase && !sameEditValue(editBase, localEdit)
  useUnsavedChanges(dirty && saving !== "delete")
  useEffect(() => {
    if (!editBase) return
    if (dirty) pendingEdits.set(draftKey, { base: editBase, local: localEdit })
    else pendingEdits.delete(draftKey)
  })
  function applyEdit(edit: ConferenceEdit) {
    setName(edit.name)
    setDescription(edit.description)
    setOrganizer(edit.organizer)
    setStartsAt(edit.startsAt)
    setEndsAt(edit.endsAt)
    setStructure(edit.structure)
  }
  function receiveConference(next: Conference) {
    if (!editBase) return
    const result = mergeConferenceEdit(
      editBase,
      localEdit,
      conferenceEdit(next)
    )
    if (result.conflicts.length) {
      setReview({ remote: next, local: localEdit, result })
      setChoices({})
      return
    }
    setConference(next)
    setEditBase(conferenceEdit(next))
    applyEdit(result.merged)
  }
  async function reviewLatest() {
    if (!token || !editBase || saving) return
    setSaving("review")
    try {
      const next = await getConference(token, conferenceId, { refresh: true })
      setReview({
        remote: next,
        local: localEdit,
        result: mergeConferenceEdit(editBase, localEdit, conferenceEdit(next)),
      })
      setChoices({})
    } catch (caught) {
      handleError(caught, message("platform_latest_load_failed"))
    } finally {
      setSaving(undefined)
    }
  }
  function applyReview() {
    if (!review || review.result.conflicts.some((key) => !choices[key])) return
    const merged = { ...review.result.merged }
    const remote = conferenceEdit(review.remote)
    for (const key of review.result.conflicts)
      Object.assign(merged, {
        [key]: choices[key] === "remote" ? remote[key] : review.local[key],
      })
    setConference(review.remote)
    setEditBase(remote)
    applyEdit(merged)
    setReview(undefined)
    setVersionConflict(false)
    setError("")
    setFieldErrors([])
  }

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
        setVersionConflict(true)
        setError("platform_version_conflict")
      } else {
        setError(caught instanceof Error ? caught.message : fallback)
      }
      if (caught instanceof ConferenceApiError) {
        setFieldErrors(
          caught.fields.map(
            (field) => `${field.path || "configuration"}: ${field.message}`
          )
        )
      }
    },
    [signOut]
  )

  const load = useCallback(
    async (refresh = false): Promise<void> => {
      if (!token || !conferenceId) return
      setIsLoading(true)
      setError("")
      setFieldErrors([])
      try {
        const next = await getConference(token, conferenceId, { refresh })
        const pending = pendingEdits.get(`${token}:${conferenceId}`)
        setEditBase(conferenceEdit(next))
        setConference(next)
        setName(next.name)
        setDescription(next.description ?? "")
        setOrganizer(next.organizer ?? "")
        setStartsAt(scheduleInput(next.startsAt))
        setEndsAt(scheduleInput(next.endsAt))
        setStructure({
          roleTemplates: next.roleTemplates,
          committees: next.committees,
        })
        if (pending) {
          const result = mergeConferenceEdit(
            pending.base,
            pending.local,
            conferenceEdit(next)
          )
          applyEdit(result.merged)
          if (result.conflicts.length) {
            setReview({ remote: next, local: pending.local, result })
            setChoices({})
          }
        }
      } catch (caught) {
        handleError(caught, message("platform_load_conference_failed"))
      } finally {
        setIsLoading(false)
      }
    },
    [conferenceId, handleError, token]
  )

  useEffect(() => {
    void load()
  }, [load])

  async function saveMetadata(): Promise<void> {
    if (
      !token ||
      !conference ||
      conference.lifecycle === "closed" ||
      saving ||
      review ||
      versionConflict
    )
      return
    if (!name.trim()) {
      setError("platform_conference_name_required")
      return
    }
    if (!conference.filesExpiredAt && scheduleError(startsAt, endsAt, locale)) {
      setError(scheduleError(startsAt, endsAt, locale))
      return
    }
    setSaving("metadata")
    setError("")
    setFieldErrors([])
    try {
      const next = await updateConferenceMetadata(
        token,
        conference.id,
        conference.version,
        {
          name: name.trim(),
          description: description.trim(),
          organizer: organizer.trim(),
          ...(!conference.filesExpiredAt
            ? {
                ...(startsAt !== scheduleInput(conference.startsAt)
                  ? { startsAt: scheduleInstant(startsAt)! }
                  : {}),
                ...(endsAt !== scheduleInput(conference.endsAt)
                  ? { endsAt: scheduleInstant(endsAt)! }
                  : {}),
              }
            : {}),
        }
      )
      setConference(next)
      setName(next.name)
      setDescription(next.description ?? "")
      setOrganizer(next.organizer ?? "")
      setStartsAt(scheduleInput(next.startsAt))
      setEndsAt(scheduleInput(next.endsAt))
      setEditBase((base) => ({
        ...conferenceEdit(next),
        structure: base?.structure ?? conferenceEdit(next).structure,
      }))
    } catch (caught) {
      handleError(caught, message("platform_save_metadata_failed"))
    } finally {
      setSaving(undefined)
    }
  }

  async function saveStructure(): Promise<void> {
    if (
      !token ||
      !conference ||
      conference.lifecycle === "closed" ||
      saving ||
      review ||
      versionConflict
    )
      return
    setSaving("structure")
    setError("")
    setFieldErrors([])
    try {
      const next = await replaceConferenceStructure(
        token,
        conference.id,
        conference.version,
        structure
      )
      setConference(next)
      setStructure({
        roleTemplates: next.roleTemplates,
        committees: next.committees,
      })
      setEditBase((base) => ({
        ...(base ?? conferenceEdit(next)),
        structure: conferenceEdit(next).structure,
      }))
    } catch (caught) {
      handleError(caught, message("platform_save_structure_failed"))
    } finally {
      setSaving(undefined)
    }
  }

  async function removeConference(): Promise<void> {
    if (!token || !conference || saving) return
    setDeleteConfirmOpen(false)
    setSaving("delete")
    setError("")
    try {
      await deleteConference(token, conference.id, conference.version)
      pendingEdits.delete(draftKey)
      router.replace("/")
    } catch (caught) {
      handleError(caught, message("platform_delete_failed"))
      setSaving(undefined)
    }
  }

  if (!isReady || (isLoading && !conference)) {
    return <PlatformLoading label={t("platform_loading_conference")} />
  }

  return (
    <PlatformShell backHref="/">
      {!conference ? (
        <div className="mx-auto max-w-xl rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">
            {error || t("platform_conference_inaccessible")}
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-5"
            onClick={() => router.push("/")}
          >
            {t("platform_back_conferences")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <section className="flex flex-col gap-6 border-b pb-8 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={
                    conference.lifecycle === "active" ? "default" : "secondary"
                  }
                >
                  {t(CONFERENCE_LIFECYCLE_LABELS[conference.lifecycle])}
                </Badge>
                <Badge variant="secondary">v{conference.version}</Badge>
                <span className="text-xs text-muted-foreground">
                  {conference.committees.length} {t("platform_committee")} ·{" "}
                  {conference.roleTemplates.length}{" "}
                  {t("platform_role_template")}
                </span>
              </div>
              <h1 className="mt-3 min-w-0 text-3xl font-bold tracking-[-0.035em] break-words sm:text-4xl">
                {conference.name}
              </h1>
              <p className="mt-3 text-sm text-muted-foreground">
                {t("platform_last_updated")}
                {new Date(conference.updatedAt).toLocaleString(locale)}
              </p>
            </div>
            <Dialog
              open={deleteConfirmOpen}
              onOpenChange={setDeleteConfirmOpen}
            >
              <DialogTrigger
                render={
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={Boolean(saving)}
                  />
                }
              >
                {saving === "delete" ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 aria-hidden="true" />
                )}
                {t("platform_delete_conference")}
              </DialogTrigger>
              <DialogContent showCloseButton={false}>
                <DialogHeader>
                  <DialogTitle>
                    {t("platform_confirm_delete_title")}
                  </DialogTitle>
                  <DialogDescription>
                    {t("platform_confirm_delete_start")}
                    {conference.name}
                    {t("platform_confirm_delete_end")}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDeleteConfirmOpen(false)}
                  >
                    {t("platform_cancel")}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={Boolean(saving)}
                    onClick={() => void removeConference()}
                  >
                    {t("platform_confirm_delete")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </section>

          {error ? (
            <div
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
            >
              <p>{error.startsWith("platform_") ? t(error) : error}</p>
              {fieldErrors.length ? (
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {fieldErrors.map((fieldError, index) => (
                    <li key={`${index}-${fieldError}`}>{fieldError}</li>
                  ))}
                </ul>
              ) : null}
              {versionConflict ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  disabled={Boolean(saving)}
                  onClick={() => void reviewLatest()}
                >
                  {t("platform_review_remote")}
                </Button>
              ) : null}
            </div>
          ) : null}

          {dirty && (
            <p role="status" className="rounded-lg border p-3 text-sm">
              {t("platform_unsaved_changes")}
            </p>
          )}
          {review && (
            <section
              aria-label={t("platform_merge_changes")}
              className="space-y-4 rounded-xl border p-5"
            >
              <h2 className="text-lg font-semibold">
                {t("platform_review_latest")}
              </h2>
              <p className="text-sm">
                {t("platform_remote_updates")}
                {review.result.changed
                  .map((key) => t(editLabels[key]))
                  .join("、") || t("platform_version_information")}
                {t("platform_merge_instructions")}
              </p>
              {review.result.conflicts.map((key) => (
                <fieldset key={key} className="space-y-3 rounded-lg border p-3">
                  <legend className="px-1 font-medium">
                    {t(editLabels[key])}
                  </legend>
                  {(["local", "remote"] as const).map((source) => (
                    <label
                      key={source}
                      className="block cursor-pointer rounded-md bg-muted/30 p-3 text-sm"
                    >
                      <input
                        type="radio"
                        name={`conflict-${key}`}
                        checked={choices[key] === source}
                        onChange={() =>
                          setChoices({ ...choices, [key]: source })
                        }
                      />{" "}
                      {source === "local"
                        ? t("platform_keep_local")
                        : t("platform_use_remote")}
                      <pre className="mt-2 max-h-56 overflow-auto font-sans whitespace-pre-wrap">
                        {describeEditValue(
                          (source === "local"
                            ? review.local
                            : conferenceEdit(review.remote))[key],
                          locale
                        )}
                      </pre>
                    </label>
                  ))}
                </fieldset>
              ))}
              {review.remote.lifecycle === "closed" && (
                <p role="alert">{t("platform_closed_retained_input")}</p>
              )}
              <Button
                disabled={review.result.conflicts.some((key) => !choices[key])}
                onClick={applyReview}
              >
                {t("platform_apply_merge")}
              </Button>
            </section>
          )}

          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(String(value))}
            className="gap-0"
          >
            <TabsList
              className="grid !h-auto w-full grid-cols-4 items-stretch sm:grid-cols-8"
              aria-label={t("platform_conference_workspace")}
            >
              <TabsTrigger
                value="readiness"
                className="!h-full min-h-11 min-w-0 py-2 text-xs sm:text-sm"
              >
                {t("platform_readiness")}
              </TabsTrigger>
              <TabsTrigger
                value="settings"
                className="!h-full min-h-11 min-w-0 py-2 text-xs sm:text-sm"
              >
                <Settings2 className="hidden sm:block" aria-hidden="true" />
                {t("platform_conference_settings")}
              </TabsTrigger>
              <TabsTrigger
                value="timeline"
                className="!h-full min-h-11 min-w-0 py-2 text-xs sm:text-sm"
              >
                <Clock3 className="hidden sm:block" aria-hidden="true" />
                {t("platform_simulation_timeline")}
              </TabsTrigger>
              <TabsTrigger
                value="seats"
                className="!h-full min-h-11 min-w-0 py-2 text-xs sm:text-sm"
              >
                <Users className="hidden sm:block" aria-hidden="true" />
                {t("platform_seat_overview")}
              </TabsTrigger>
              <TabsTrigger
                value="news"
                className="!h-full min-h-11 min-w-0 py-2 text-xs sm:text-sm"
              >
                <Newspaper className="hidden sm:block" aria-hidden="true" />
                {t("platform_news")}
              </TabsTrigger>
              <TabsTrigger
                value="directives"
                className="!h-full min-h-11 min-w-0 py-2 text-xs sm:text-sm"
              >
                <ScrollText className="hidden sm:block" aria-hidden="true" />
                {t("platform_directives")}
              </TabsTrigger>
              <TabsTrigger
                value="situations"
                className="!h-full min-h-11 min-w-0 py-2 text-xs sm:text-sm"
              >
                <Radio className="hidden sm:block" aria-hidden="true" />
                {t("platform_situations")}
              </TabsTrigger>
              <TabsTrigger
                value="files"
                className="!h-full min-h-11 min-w-0 py-2 text-xs sm:text-sm"
              >
                <FolderOpen className="hidden sm:block" aria-hidden="true" />
                {t("platform_files")}
              </TabsTrigger>
            </TabsList>

            <fieldset disabled={Boolean(review)} className="mt-8 min-w-0">
              <TabsContent value="readiness">
                <ConferenceReadiness
                  conference={conference}
                  hasUnsavedChanges={dirty}
                  onNavigate={setActiveTab}
                />
              </TabsContent>
              <TabsContent value="settings">
                <div className="space-y-8">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">
                        {t("platform_basic_information")}
                      </CardTitle>
                      <p className="text-sm leading-6 text-muted-foreground">
                        {t("platform_basic_information_intro")}
                      </p>
                    </CardHeader>
                    <CardContent className="grid min-w-0 gap-x-6 gap-y-5 md:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="conference-name">
                          {t("platform_conference_name")}
                        </Label>
                        <Input
                          id="conference-name"
                          value={name}
                          maxLength={120}
                          disabled={
                            Boolean(saving) || conference.lifecycle === "closed"
                          }
                          onChange={(event) => setName(event.target.value)}
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="conference-organizer">
                          {t("platform_organizer")}
                        </Label>
                        <Input
                          id="conference-organizer"
                          value={organizer}
                          maxLength={120}
                          disabled={
                            Boolean(saving) || conference.lifecycle === "closed"
                          }
                          onChange={(event) => setOrganizer(event.target.value)}
                        />
                      </div>
                      <div className="flex flex-col gap-2 md:col-span-2">
                        <Label htmlFor="conference-description">
                          {t("platform_conference_description")}
                        </Label>
                        <textarea
                          id="conference-description"
                          value={description}
                          maxLength={4000}
                          disabled={
                            Boolean(saving) || conference.lifecycle === "closed"
                          }
                          className={textareaClassName}
                          onChange={(event) =>
                            setDescription(event.target.value)
                          }
                        />
                      </div>
                      <div className="md:col-span-2">
                        <ConferenceScheduleFields
                          startsAt={startsAt}
                          endsAt={endsAt}
                          onStartChange={setStartsAt}
                          onEndChange={setEndsAt}
                          disabled={
                            Boolean(saving) ||
                            conference.lifecycle === "closed" ||
                            Boolean(conference.filesExpiredAt)
                          }
                        />
                      </div>
                      {conference.filesExpiredAt ? (
                        <p className="text-sm text-muted-foreground md:col-span-2">
                          {t("platform_cleanup_locked")}
                        </p>
                      ) : null}
                      <div className="flex justify-end md:col-span-2">
                        <Button
                          type="button"
                          size="lg"
                          disabled={
                            Boolean(saving) || conference.lifecycle === "closed"
                          }
                          onClick={() => void saveMetadata()}
                        >
                          {saving === "metadata" ? (
                            <Loader2
                              className="animate-spin"
                              aria-hidden="true"
                            />
                          ) : (
                            <Save aria-hidden="true" />
                          )}
                          {t("platform_save_basic_information")}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <section
                    className="min-w-0"
                    aria-labelledby="structure-heading"
                  >
                    <div className="mb-6 flex items-start gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-lg border bg-muted/30 text-muted-foreground">
                        <FileText className="size-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <h2
                          id="structure-heading"
                          className="text-xl font-semibold tracking-tight"
                        >
                          {t("platform_conference_structure")}
                        </h2>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {conference.lifecycle === "closed"
                            ? t("platform_closed_structure_readonly")
                            : t("platform_structure_edit_hint")}
                        </p>
                      </div>
                    </div>

                    <ConferenceStructureEditor
                      value={structure}
                      onChange={setStructure}
                      disabled={
                        Boolean(saving) || conference.lifecycle === "closed"
                      }
                      allowExistingRemoval={conference.lifecycle === "draft"}
                      conferenceId={conference.id}
                    />

                    {conference.lifecycle !== "closed" ? (
                      <div className="sticky bottom-4 mt-8 flex justify-end rounded-xl border bg-background p-3 shadow-sm">
                        <Button
                          type="button"
                          size="lg"
                          disabled={Boolean(saving)}
                          onClick={() => void saveStructure()}
                        >
                          {saving === "structure" ? (
                            <Loader2
                              className="animate-spin"
                              aria-hidden="true"
                            />
                          ) : (
                            <Save aria-hidden="true" />
                          )}
                          {t("platform_save_structure")}
                        </Button>
                      </div>
                    ) : null}
                  </section>

                  {token ? (
                    <ConferenceCloseCard
                      token={token}
                      conferenceId={conference.id}
                      lifecycle={conference.lifecycle}
                      version={conference.version}
                      onConferenceChange={receiveConference}
                      onError={handleError}
                    />
                  ) : null}
                </div>
              </TabsContent>

              <TabsContent value="timeline">
                {conference.lifecycle === "closed" ? (
                  <Card>
                    <CardContent className="py-10 text-center text-muted-foreground">
                      {t("platform_closed_timeline_readonly")}
                    </CardContent>
                  </Card>
                ) : token ? (
                  <ConferenceSituationWorkspace
                    token={token}
                    conference={conference}
                    hasUnsavedStructure={
                      JSON.stringify(structure) !==
                      JSON.stringify({
                        roleTemplates: conference.roleTemplates,
                        committees: conference.committees,
                      })
                    }
                    settingsOnly
                    onConferenceChange={receiveConference}
                    onError={handleError}
                  />
                ) : null}
              </TabsContent>

              <TabsContent value="seats">
                {token && (
                  <ConferenceSeatOverview
                    token={token}
                    conference={conference}
                    hasUnsavedStructure={
                      JSON.stringify(structure) !==
                      JSON.stringify({
                        roleTemplates: conference.roleTemplates,
                        committees: conference.committees,
                      })
                    }
                  />
                )}
              </TabsContent>

              <TabsContent value="news">
                {token ? (
                  <ConferenceNewsWorkspace
                    token={token}
                    conferenceId={conference.id}
                    lifecycle={conference.lifecycle}
                    onError={handleError}
                  />
                ) : null}
              </TabsContent>

              <TabsContent value="directives">
                {token ? (
                  <ConferenceDirectiveWorkspace
                    token={token}
                    conferenceId={conference.id}
                    lifecycle={conference.lifecycle}
                    onError={handleError}
                  />
                ) : null}
              </TabsContent>

              <TabsContent value="situations">
                {conference.lifecycle === "draft" ? (
                  <Card>
                    <CardContent className="py-10 text-center text-muted-foreground">
                      {t("platform_activate_for_situations")}
                    </CardContent>
                  </Card>
                ) : token ? (
                  <ConferenceSituationWorkspace
                    token={token}
                    conference={conference}
                    onConferenceChange={receiveConference}
                    onError={handleError}
                  />
                ) : null}
              </TabsContent>

              <TabsContent value="files">
                {token ? (
                  <ConferenceFilesWorkspace
                    filesExpireAt={conference.filesExpireAt}
                    filesExpiredAt={conference.filesExpiredAt}
                    token={token}
                    conferenceId={conference.id}
                    lifecycle={conference.lifecycle}
                    onError={handleError}
                  />
                ) : null}
              </TabsContent>
            </fieldset>
          </Tabs>
        </div>
      )}
    </PlatformShell>
  )
}
