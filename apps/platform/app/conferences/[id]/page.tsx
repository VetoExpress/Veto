/* Hallmark · genre: modern-minimal · macrostructure: Workbench · theme: Coral · designed-as-app */
/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4 */
"use client"

import { useCallback, useEffect, useState } from "react"
import type { JSX } from "react"
import {
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
import {
  Tabs,
  TabsList,
  TabsTab,
  TabsPanels,
  TabsPanel,
} from "@/components/animate-ui/components/base/tabs"
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
import { conferenceEdit, mergeConferenceEdit, sameEditValue, editLabels, describeEditValue, type ConferenceEdit } from "@/lib/conference-edit"
import { useUnsavedChanges } from "@/lib/use-unsaved-changes"

type SavingSection = "metadata" | "structure" | "delete" | "review"
const pendingEdits = new Map<string, { base: ConferenceEdit; local: ConferenceEdit }>()

export default function ConferenceDetailPage(): JSX.Element {
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
  const [review, setReview] = useState<{ remote: Conference; local: ConferenceEdit; result: ReturnType<typeof mergeConferenceEdit> }>()
  const [choices, setChoices] = useState<Partial<Record<keyof ConferenceEdit, "local" | "remote">>>({})
  const conferenceId = params.id
  const draftKey = `${token}:${conferenceId}`
  const localEdit: ConferenceEdit = { name, description, organizer, startsAt, endsAt, structure }
  const dirty = !!editBase && !sameEditValue(editBase, localEdit)
  useUnsavedChanges(dirty && saving !== "delete")
  useEffect(() => {
    if (!editBase) return
    if (dirty) pendingEdits.set(draftKey, { base: editBase, local: localEdit })
    else pendingEdits.delete(draftKey)
  })
  function applyEdit(edit: ConferenceEdit) {
    setName(edit.name); setDescription(edit.description); setOrganizer(edit.organizer)
    setStartsAt(edit.startsAt); setEndsAt(edit.endsAt); setStructure(edit.structure)
  }
  function receiveConference(next: Conference) {
    if (!editBase) return
    const result = mergeConferenceEdit(editBase, localEdit, conferenceEdit(next))
    if (result.conflicts.length) { setReview({ remote: next, local: localEdit, result }); setChoices({}); return }
    setConference(next); setEditBase(conferenceEdit(next)); applyEdit(result.merged)
  }
  async function reviewLatest() {
    if (!token || !editBase || saving) return
    setSaving("review")
    try {
      const next = await getConference(token, conferenceId, { refresh: true })
      setReview({ remote: next, local: localEdit, result: mergeConferenceEdit(editBase, localEdit, conferenceEdit(next)) })
      setChoices({})
    } catch (caught) { handleError(caught, "无法加载最新版本，输入已保留") }
    finally { setSaving(undefined) }
  }
  function applyReview() {
    if (!review || review.result.conflicts.some((key) => !choices[key])) return
    const merged = { ...review.result.merged }
    const remote = conferenceEdit(review.remote)
    for (const key of review.result.conflicts) Object.assign(merged, { [key]: choices[key] === "remote" ? remote[key] : review.local[key] })
    setConference(review.remote); setEditBase(remote); applyEdit(merged)
    setReview(undefined); setVersionConflict(false); setError(""); setFieldErrors([])
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
        setError("大会已在其他位置更新，你的输入已保留。请查看变更并选择如何合并。")
      } else {
        setError(caught instanceof Error ? caught.message : fallback)
      }
      if (caught instanceof ConferenceApiError) {
        setFieldErrors(
          caught.fields.map(
            (field) => `${field.path || "大会配置"}：${field.message}`
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
          const result = mergeConferenceEdit(pending.base, pending.local, conferenceEdit(next))
          applyEdit(result.merged)
          if (result.conflicts.length) { setReview({ remote: next, local: pending.local, result }); setChoices({}) }
        }
      } catch (caught) {
        handleError(caught, "加载大会失败")
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
    if (!token || !conference || conference.lifecycle === "closed" || saving || review || versionConflict)
      return
    if (!name.trim()) {
      setError("大会名称不能为空")
      return
    }
    if (!conference.filesExpiredAt && scheduleError(startsAt, endsAt)) {
      setError(scheduleError(startsAt, endsAt))
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
                  ? { startsAt: scheduleInstant(startsAt) }
                  : {}),
                ...(endsAt !== scheduleInput(conference.endsAt)
                  ? { endsAt: scheduleInstant(endsAt) }
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
      setEditBase((base) => ({ ...conferenceEdit(next), structure: base?.structure ?? conferenceEdit(next).structure }))
    } catch (caught) {
      handleError(caught, "保存大会信息失败")
    } finally {
      setSaving(undefined)
    }
  }

  async function saveStructure(): Promise<void> {
    if (!token || !conference || conference.lifecycle === "closed" || saving || review || versionConflict)
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
      setEditBase((base) => ({ ...(base ?? conferenceEdit(next)), structure: conferenceEdit(next).structure }))
    } catch (caught) {
      handleError(caught, "保存大会结构失败")
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
      handleError(caught, "删除大会失败")
      setSaving(undefined)
    }
  }

  if (!isReady || (isLoading && !conference)) {
    return <PlatformLoading label="正在加载大会" />
  }

  return (
    <PlatformShell backHref="/">
      {!conference ? (
        <div className="mx-auto max-w-xl rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">
            {error || "大会不存在或无法访问"}
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-5"
            onClick={() => router.push("/")}
          >
            返回大会列表
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
                  {CONFERENCE_LIFECYCLE_LABELS[conference.lifecycle]}
                </Badge>
                <Badge variant="secondary">v{conference.version}</Badge>
                <span className="text-xs text-muted-foreground">
                  {conference.committees.length} 个委员会 ·{" "}
                  {conference.roleTemplates.length} 个角色
                </span>
              </div>
              <h1 className="mt-3 min-w-0 text-3xl font-bold tracking-[-0.035em] break-words sm:text-4xl">
                {conference.name}
              </h1>
              <p className="mt-3 text-sm text-muted-foreground">
                上次更新：
                {new Date(conference.updatedAt).toLocaleString("zh-CN")}
              </p>
            </div>
            <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
              <DialogTrigger
                render={
                  <Button type="button" variant="destructive" disabled={Boolean(saving)} />
                }
              >
                {saving === "delete" ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 aria-hidden="true" />
                )}
                删除大会
              </DialogTrigger>
              <DialogContent showCloseButton={false}>
                <DialogHeader>
                  <DialogTitle>确认删除大会？</DialogTitle>
                  <DialogDescription>
                    确定删除“{conference.name}”吗？删除后可从大会列表恢复。
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDeleteConfirmOpen(false)}
                  >
                    取消
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={Boolean(saving)}
                    onClick={() => void removeConference()}
                  >
                    确认删除
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
              <p>{error}</p>
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
                  查看远端变更
                </Button>
              ) : null}
            </div>
          ) : null}

          {dirty && <p role="status" className="rounded-lg border p-3 text-sm">有未保存的修改，请保存基本信息或大会结构后离开。</p>}
          {review && <section aria-label="合并大会修改" className="space-y-4 rounded-xl border p-5">
            <h2 className="text-lg font-semibold">核对最新版本</h2>
            <p className="text-sm">远端更新：{review.result.changed.map((key) => editLabels[key]).join("、") || "版本信息"}。没有冲突的字段已自动合并；应用后仍需点击保存。</p>
            {review.result.conflicts.map((key) => <fieldset key={key} className="space-y-3 rounded-lg border p-3">
              <legend className="px-1 font-medium">{editLabels[key]}</legend>
              {(["local", "remote"] as const).map((source) => <label key={source} className="block cursor-pointer rounded-md bg-muted/30 p-3 text-sm">
                <input type="radio" name={`conflict-${key}`} checked={choices[key] === source} onChange={() => setChoices({ ...choices, [key]: source })} /> {source === "local" ? "保留我的修改" : "使用远端版本"}
                <pre className="mt-2 max-h-56 overflow-auto font-sans whitespace-pre-wrap">{describeEditValue((source === "local" ? review.local : conferenceEdit(review.remote))[key])}</pre>
              </label>)}
            </fieldset>)}
            {review.remote.lifecycle === "closed" && <p role="alert">大会已结束，保留的输入可复制查看，不能再保存。</p>}
            <Button disabled={review.result.conflicts.some((key) => !choices[key])} onClick={applyReview}>应用合并结果</Button>
          </section>}

          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(String(value))} className="gap-0">
            <TabsList
              className="grid h-auto w-full grid-cols-4 sm:grid-cols-7"
              aria-label="大会工作区"
            >
              <TabsTab value="readiness" className="min-h-11 min-w-0 py-2 text-xs sm:text-sm">开会前检查</TabsTab>
              <TabsTab
                value="settings"
                className="min-h-11 min-w-0 py-2 text-xs sm:text-sm"
              >
                <Settings2 className="hidden sm:block" aria-hidden="true" />
                大会设置
              </TabsTab>
              <TabsTab
                value="seats"
                className="min-h-11 min-w-0 py-2 text-xs sm:text-sm"
              >
                <Users className="hidden sm:block" aria-hidden="true" />
                席位总览
              </TabsTab>
              <TabsTab
                value="news"
                className="min-h-11 min-w-0 py-2 text-xs sm:text-sm"
              >
                <Newspaper className="hidden sm:block" aria-hidden="true" />
                新闻
              </TabsTab>
              <TabsTab
                value="directives"
                className="min-h-11 min-w-0 py-2 text-xs sm:text-sm"
              >
                <ScrollText className="hidden sm:block" aria-hidden="true" />
                指令
              </TabsTab>
              <TabsTab
                value="situations"
                className="min-h-11 min-w-0 py-2 text-xs sm:text-sm"
              >
                <Radio className="hidden sm:block" aria-hidden="true" />
                局势
              </TabsTab>
              <TabsTab
                value="files"
                className="min-h-11 min-w-0 py-2 text-xs sm:text-sm"
              >
                <FolderOpen className="hidden sm:block" aria-hidden="true" />
                文件
              </TabsTab>
            </TabsList>

            <TabsPanels className="mt-8">
              <fieldset disabled={Boolean(review)} className="min-w-0">
              <TabsPanel value="readiness">
                <ConferenceReadiness conference={conference} hasUnsavedChanges={dirty} onNavigate={setActiveTab} />
              </TabsPanel>
              <TabsPanel value="settings">
                {conference.lifecycle !== "closed" && token ? (
                  <div className="mb-8 space-y-4">
                    <div>
                      <h2 className="text-xl font-semibold">模拟时间线</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {conference.lifecycle === "draft"
                          ? "完成结构编辑并保存时间配置后，手动激活大会。"
                          : "大会运行期间可修改现有时间线，是否使用时间线保持不变。"}
                      </p>
                    </div>
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
                  </div>
                ) : null}
                <div className="grid min-w-0 gap-8 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
                  <div className="flex min-w-0 flex-col gap-8">
                    <Card className="bg-muted/30 shadow-none ring-0 lg:sticky lg:top-6">
                      <CardHeader>
                        <CardTitle className="text-lg">基本信息</CardTitle>
                        <p className="text-sm leading-6 text-muted-foreground">
                          大会名称、公开说明和主办方信息。
                        </p>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-5">
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="conference-name">大会名称</Label>
                          <Input
                            id="conference-name"
                            value={name}
                            maxLength={120}
                            disabled={
                              Boolean(saving) ||
                              conference.lifecycle === "closed"
                            }
                            onChange={(event) => setName(event.target.value)}
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="conference-description">
                            大会说明
                          </Label>
                          <textarea
                            id="conference-description"
                            value={description}
                            maxLength={4000}
                            disabled={
                              Boolean(saving) ||
                              conference.lifecycle === "closed"
                            }
                            className={textareaClassName}
                            onChange={(event) =>
                              setDescription(event.target.value)
                            }
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="conference-organizer">主办方</Label>
                          <Input
                            id="conference-organizer"
                            value={organizer}
                            maxLength={120}
                            disabled={
                              Boolean(saving) ||
                              conference.lifecycle === "closed"
                            }
                            onChange={(event) =>
                              setOrganizer(event.target.value)
                            }
                          />
                        </div>
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
                        {conference.filesExpiredAt ? (
                          <p className="text-sm text-muted-foreground">
                            文件到期清理已开始，会议时间已锁定，无法延长或恢复文件。
                          </p>
                        ) : null}
                        <Button
                          type="button"
                          size="lg"
                          className="w-full"
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
                          保存基本信息
                        </Button>
                      </CardContent>
                    </Card>
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
                          大会结构
                        </h2>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {conference.lifecycle === "closed"
                            ? "已结束的大会不能修改结构。"
                            : "可新增和修改角色、委员会与席位；活动中的大会保留已有对象。"}
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
                          保存大会结构
                        </Button>
                      </div>
                    ) : null}
                  </section>
                </div>
              </TabsPanel>

              <TabsPanel value="seats">
                {token && <ConferenceSeatOverview
                  token={token}
                  conference={conference}
                  hasUnsavedStructure={
                    JSON.stringify(structure) !==
                    JSON.stringify({
                      roleTemplates: conference.roleTemplates,
                      committees: conference.committees,
                    })
                  }
                />}
              </TabsPanel>

              <TabsPanel value="news">
                {token ? (
                  <ConferenceNewsWorkspace
                    token={token}
                    conferenceId={conference.id}
                    lifecycle={conference.lifecycle}
                    onError={handleError}
                  />
                ) : null}
              </TabsPanel>

              <TabsPanel value="directives">
                {token ? (
                  <ConferenceDirectiveWorkspace
                    token={token}
                    conferenceId={conference.id}
                    lifecycle={conference.lifecycle}
                    onError={handleError}
                  />
                ) : null}
              </TabsPanel>

              <TabsPanel value="situations">
                {conference.lifecycle === "draft" ? (
                  <Card>
                    <CardContent className="py-10 text-center text-muted-foreground">
                      大会激活可查看局势。
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
              </TabsPanel>

              <TabsPanel value="files">
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
              </TabsPanel>
              </fieldset>
            </TabsPanels>
          </Tabs>
        </div>
      )}
    </PlatformShell>
  )
}
