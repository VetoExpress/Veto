"use client"
import { message } from "@/i18n/messages"
import { usePlatformTranslations } from "@/components/i18n-provider"

import { useEffect, useRef, useState } from "react"
import type { ComponentType, FormEvent } from "react"
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardList,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react"
import { useRouter } from "next/navigation"
import type { ImportedSeat } from "@vetoexpress/utils/seat-import"

import { PlatformLoading, PlatformShell } from "@/components/platform-shell"
import { CapabilityPicker } from "@/components/capability-picker"
import { SeatImportDialog } from "@/components/seat-import-dialog"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  CAPABILITY_LABELS,
  ConferenceApiError,
  createConference,
  type CommitteeInput,
  type ConferenceStructure,
  type RoleTemplateInput,
  type SeatInput,
} from "@/lib/conference-client"
import {
  createClientId,
  roleAllowedInCommittee,
  roleReference,
} from "@/lib/conference-structure"
import { ConferenceScheduleFields } from "@/components/conference-schedule-fields"
import {
  scheduleInstant,
  scheduleError,
  formatSchedule,
} from "@/lib/conference-schedule"
import { usePlatformAuth } from "@/lib/use-platform-auth"
import { cn } from "@/lib/utils"

type StepId = "event" | "schedule" | "meeting" | "roles" | "seats" | "review"
interface WizardStep {
  id: StepId
  title: string
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>
}

const steps: WizardStep[] = [
  { id: "event", title: message("platform_conference_info"), icon: Building2 },
  {
    id: "schedule",
    title: message("platform_conference_time"),
    icon: CalendarDays,
  },
  {
    id: "meeting",
    title: message("platform_committee_planning"),
    icon: ClipboardList,
  },
  {
    id: "roles",
    title: message("platform_role_capabilities"),
    icon: ShieldCheck,
  },
  { id: "seats", title: message("platform_seat_assignment"), icon: Users },
  { id: "review", title: message("platform_confirm_creation"), icon: Check },
]

const committeeTypeLabels: Record<CommitteeInput["type"], string> = {
  cabinet: message("platform_cabinet"),
  mpc: "MPC",
  ipc: "IPC",
}
const textareaClassName =
  "min-h-28 w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30"

const defaultRoles: RoleTemplateInput[] = [
  {
    clientId: "role-preset-delegate",
    name: "常规代表",
    builtIn: true,
    capabilities: [
      "view_conference",
      "view_situation",
      "view_news",
      "view_files",
      "submit_directive",
      "send_files",
      "draft_resolution",
    ],
  },
  {
    clientId: "role-preset-mpc-press",
    name: "MPC 记者",
    systemCode: "mpc_press",
    builtIn: true,
    capabilities: [
      "view_conference",
      "view_situation",
      "view_news",
      "view_files",
      "draft_news",
      "send_files",
    ],
  },
  {
    clientId: "role-preset-chair",
    name: "主场主席团",
    description: "主持委员会并处理会议流程",
    builtIn: true,
    capabilities: [
      "view_conference",
      "view_situation",
      "view_news",
      "view_files",
      "process_directive",
      "send_files",
      "publish_situation",
      "review_files",
      "withdraw_news",
      "withdraw_situation",
      "withdraw_files",
      "control_conference",
      "draft_resolution",
    ],
  },
  {
    clientId: "role-preset-ipc",
    name: "IPC",
    systemCode: "ipc",
    builtIn: true,
    capabilities: [
      "view_conference",
      "view_situation",
      "view_news",
      "view_files",
      "process_directive",
      "review_news",
      "publish_situation",
      "control_conference",
      "control_timeline",
    ],
  },
  {
    clientId: "role-preset-staff",
    name: "Staff",
    systemCode: "staff",
    builtIn: true,
    capabilities: [
      "view_conference",
      "view_situation",
      "view_news",
      "view_files",
      "draft_news",
      "review_news",
      "submit_directive",
      "process_directive",
      "send_files",
      "publish_situation",
      "control_conference",
      "draft_resolution",
    ],
  },
]

const initialStructure: ConferenceStructure = {
  roleTemplates: defaultRoles,
  committees: [
    {
      clientId: "committee-initial",
      name: "",
      type: "cabinet",
      seats: [],
      agenda: [],
    },
  ],
}

function FieldError({ children }: { children: string }) {
  return (
    <p className="text-sm text-destructive" role="alert">
      {children}
    </p>
  )
}
function committeeReference(committee: CommitteeInput, index: number): string {
  return committee.id ?? committee.clientId ?? String(index)
}
function seatReference(seat: SeatInput, index: number): string {
  return seat.id ?? seat.clientId ?? String(index)
}

export default function NewConferencePage() {
  const { t, locale } = usePlatformTranslations()

  const router = useRouter()
  const { token, isReady, signOut } = usePlatformAuth()
  const contentRef = useRef<HTMLDivElement>(null)
  const lastSubmission = useRef<{ payload: string; key: string }>(undefined)
  const [currentStep, setCurrentStep] = useState(0)
  const [attempted, setAttempted] = useState(false)
  const [collapsedCommittees, setCollapsedCommittees] = useState<
    Record<string, boolean>
  >({})
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [organizer, setOrganizer] = useState("")
  const [startsAt, setStartsAt] = useState("")
  const [endsAt, setEndsAt] = useState("")
  const [structure, setStructure] =
    useState<ConferenceStructure>(initialStructure)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")
  const [fieldErrors, setFieldErrors] = useState<string[]>([])

  const eventValid = name.trim().length > 0
  const scheduleValid = !scheduleError(startsAt, endsAt, locale)
  const meetingValid =
    structure.committees.length > 0 &&
    structure.committees.every((committee) => committee.name.trim().length > 0)
  const rolesValid =
    structure.roleTemplates.length > 0 &&
    structure.roleTemplates.every(
      (role) => role.name.trim().length > 0 && role.capabilities.length > 0
    )
  const seatsValid =
    meetingValid &&
    structure.committees.every(
      (committee) =>
        committee.seats.length > 0 &&
        committee.seats.every((seat) => {
          const role = structure.roleTemplates.find(
            (item) => roleReference(item) === seat.roleTemplateId
          )
          return (
            seat.name.trim().length > 0 &&
            Boolean(role) &&
            roleAllowedInCommittee(role!, committee.type)
          )
        })
    )

  function isStepValid(id: StepId): boolean {
    if (id === "event") return eventValid
    if (id === "schedule") return scheduleValid
    if (id === "meeting") return meetingValid
    if (id === "roles") return rolesValid
    if (id === "seats") return seatsValid
    return true
  }
  function focusFirstInvalid(): void {
    requestAnimationFrame(() =>
      contentRef.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus()
    )
  }
  function goToStep(index: number): void {
    if (index < 0 || index >= steps.length || isSaving) return
    if (index <= currentStep) {
      setAttempted(false)
      setCurrentStep(index)
      return
    }
    if (!isStepValid(steps[currentStep].id)) {
      setAttempted(true)
      focusFirstInvalid()
      return
    }
    setAttempted(false)
    setCurrentStep(index)
  }
  function updateRole(index: number, patch: Partial<RoleTemplateInput>): void {
    setStructure((current) => {
      const roleTemplates = [...current.roleTemplates]
      roleTemplates[index] = { ...roleTemplates[index], ...patch }
      return { ...current, roleTemplates }
    })
  }
  function removeRole(index: number): void {
    const reference = roleReference(structure.roleTemplates[index])
    if (
      structure.committees.some((committee) =>
        committee.seats.some((seat) => seat.roleTemplateId === reference)
      )
    )
      return
    setStructure((current) => ({
      ...current,
      roleTemplates: current.roleTemplates.filter(
        (_, roleIndex) => roleIndex !== index
      ),
    }))
  }
  function updateCommittee(
    index: number,
    patch: Partial<CommitteeInput>
  ): void {
    setStructure((current) => {
      const committees = [...current.committees]
      committees[index] = { ...committees[index], ...patch }
      return { ...current, committees }
    })
  }
  function changeCommitteeType(
    index: number,
    type: CommitteeInput["type"]
  ): void {
    const committee = structure.committees[index]
    updateCommittee(index, {
      type,
      seats: committee.seats.map((seat) => {
        const role = structure.roleTemplates.find(
          (item) => roleReference(item) === seat.roleTemplateId
        )
        return role && !roleAllowedInCommittee(role, type)
          ? { ...seat, roleTemplateId: "" }
          : seat
      }),
    })
  }
  function addSeat(committeeIndex: number): void {
    const committee = structure.committees[committeeIndex]
    setCollapsedCommittees((current) => ({
      ...current,
      [committeeReference(committee, committeeIndex)]: false,
    }))
    const defaultRole = structure.roleTemplates.find((role) =>
      roleAllowedInCommittee(role, committee.type)
    )
    updateCommittee(committeeIndex, {
      seats: [
        ...committee.seats,
        {
          clientId: createClientId("seat"),
          name: "",
          shortName: "",
          roleTemplateId: defaultRole ? roleReference(defaultRole) : "",
          hasVotingRights: true,
        },
      ],
    })
  }
  function updateSeat(
    committeeIndex: number,
    seatIndex: number,
    patch: Partial<SeatInput>
  ): void {
    const committee = structure.committees[committeeIndex]
    const seats = [...committee.seats]
    seats[seatIndex] = { ...seats[seatIndex], ...patch }
    updateCommittee(committeeIndex, { seats })
  }
  function importedRoleReference(
    committee: CommitteeInput,
    roleName: string
  ): string {
    const allowedRoles = structure.roleTemplates.filter((role) =>
      roleAllowedInCommittee(role, committee.type)
    )
    const normalized = roleName.replace(/\s+/g, "").toLowerCase()
    if (!normalized)
      return allowedRoles[0] ? roleReference(allowedRoles[0]) : ""
    const role = allowedRoles.find(
      (item) => item.name.replace(/\s+/g, "").toLowerCase() === normalized
    )
    return role ? roleReference(role) : ""
  }
  function importRoleLabel(roleName: string, target?: string): string {
    const committee = structure.committees.find(
      (item, index) => committeeReference(item, index) === target
    )
    if (!committee)
      return roleName ? "unmatched" : t("platform_no_available_role")
    const reference = importedRoleReference(committee, roleName)
    return (
      structure.roleTemplates.find((role) => roleReference(role) === reference)
        ?.name || (roleName ? "unmatched" : t("platform_no_available_role"))
    )
  }
  function importSeats(rows: ImportedSeat[], target?: string): void {
    const committeeIndex = structure.committees.findIndex(
      (committee, index) => committeeReference(committee, index) === target
    )
    if (committeeIndex < 0) return
    const committee = structure.committees[committeeIndex]
    setCollapsedCommittees((current) => ({
      ...current,
      [committeeReference(committee, committeeIndex)]: false,
    }))
    updateCommittee(committeeIndex, {
      seats: [
        ...committee.seats,
        ...rows.map((row) => ({
          clientId: createClientId("seat"),
          name: row.name,
          shortName: row.shortName,
          roleTemplateId: importedRoleReference(committee, row.roleName ?? ""),
          hasVotingRights: row.hasVotingRights ?? true,
        })),
      ],
    })
  }

  async function submit(event?: FormEvent): Promise<void> {
    event?.preventDefault()
    if (!token || isSaving) return
    if (
      !eventValid ||
      !scheduleValid ||
      !meetingValid ||
      !rolesValid ||
      !seatsValid
    ) {
      const firstInvalid = steps.findIndex((step) => !isStepValid(step.id))
      setCurrentStep(Math.max(firstInvalid, 0))
      setAttempted(true)
      focusFirstInvalid()
      return
    }
    const input = {
      name: name.trim(),
      description: description.trim() || undefined,
      organizer: organizer.trim() || undefined,
      startsAt: scheduleInstant(startsAt)!,
      endsAt: scheduleInstant(endsAt)!,
      roleTemplates: structure.roleTemplates.map((role) => ({
        ...role,
        name: role.name.trim(),
        description: role.description?.trim() || undefined,
      })),
      committees: structure.committees.map((committee) => ({
        ...committee,
        name: committee.name.trim(),
        seats: committee.seats.map((seat) => ({
          ...seat,
          name: seat.name.trim(),
          shortName: seat.shortName?.trim() || undefined,
        })),
      })),
    }
    const payload = JSON.stringify(input)
    if (!lastSubmission.current || lastSubmission.current.payload !== payload)
      lastSubmission.current = { payload, key: crypto.randomUUID() }
    setIsSaving(true)
    setError("")
    setFieldErrors([])
    try {
      const conference = await createConference(
        token,
        input,
        lastSubmission.current.key
      )
      router.replace(`/conferences/${conference.id}`)
    } catch (caught) {
      if (caught instanceof ConferenceApiError && caught.status === 401) {
        signOut()
        return
      }
      setError(
        caught instanceof Error
          ? caught.message
          : message("platform_create_failed")
      )
      if (caught instanceof ConferenceApiError)
        setFieldErrors(
          caught.fields.map(
            (field) =>
              `${field.path || t("platform_conference_configuration")}: ${field.message}`
          )
        )
    } finally {
      setIsSaving(false)
    }
  }

  if (!isReady) return <PlatformLoading />
  const totalSeats = structure.committees.reduce(
    (total, committee) => total + committee.seats.length,
    0
  )

  return (
    <PlatformShell backHref="/">
      <form onSubmit={(event) => void submit(event)}>
        <header className="flex items-center justify-between gap-4 pb-6">
          <div>
            <h1 className="text-xl font-semibold">
              {t("platform_create_conference")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("platform_create_intro")}
            </p>
          </div>
          <Badge variant="outline" className="shrink-0">
            {t("platform_step")}
            {currentStep + 1}/{steps.length}
          </Badge>
        </header>

        <div className="flex min-h-[34rem] items-start gap-5">
          <nav
            aria-label={t("platform_creation_steps")}
            className="sticky top-24 hidden w-48 shrink-0 rounded-3xl bg-background/70 px-4 py-5 backdrop-blur-xl lg:block"
          >
            <div className="flex flex-col gap-1">
              {steps.map((step, index) => {
                const Icon = step.icon
                const completed =
                  index <= currentStep &&
                  index < steps.length - 1 &&
                  isStepValid(step.id)
                return (
                  <button
                    key={step.id}
                    type="button"
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                      index === currentStep
                        ? "bg-accent font-medium text-accent-foreground"
                        : completed
                          ? "text-foreground"
                          : "text-muted-foreground"
                    )}
                    onClick={() => goToStep(index)}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">
                      {t(step.title)}
                    </span>
                    {completed ? (
                      <Check
                        className="size-3.5 shrink-0 text-emerald-500"
                        aria-hidden
                      />
                    ) : null}
                  </button>
                )
              })}
            </div>
          </nav>

          <div className="min-w-0 flex-1">
            <div
              ref={contentRef}
              className="min-h-52 rounded-2xl border bg-card/80 p-5 shadow-[0_1.5rem_4rem_color-mix(in_oklch,var(--primary)_6%,transparent)] backdrop-blur-xl sm:p-6"
            >
              {steps[currentStep].id === "event" ? (
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="event-name">
                      {t("platform_conference_name")}
                      <span className="text-destructive"> *</span>
                    </Label>
                    <Input
                      id="event-name"
                      value={name}
                      maxLength={120}
                      disabled={isSaving}
                      aria-invalid={
                        attempted && !name.trim() ? true : undefined
                      }
                      onChange={(event) => setName(event.target.value)}
                    />
                    {attempted && !name.trim() ? (
                      <FieldError>
                        {t("platform_enter_conference_name")}
                      </FieldError>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="organizer">{t("platform_organizer")}</Label>
                    <Input
                      id="organizer"
                      value={organizer}
                      maxLength={120}
                      disabled={isSaving}
                      placeholder={t("platform_organizer_placeholder")}
                      onChange={(event) => setOrganizer(event.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="event-description">
                      {t("platform_conference_description")}
                    </Label>
                    <textarea
                      id="event-description"
                      value={description}
                      maxLength={4000}
                      disabled={isSaving}
                      className={textareaClassName}
                      placeholder={t("platform_description_placeholder")}
                      onChange={(event) => setDescription(event.target.value)}
                    />
                  </div>
                </div>
              ) : null}

              {steps[currentStep].id === "schedule" ? (
                <ConferenceScheduleFields
                  startsAt={startsAt}
                  endsAt={endsAt}
                  onStartChange={setStartsAt}
                  onEndChange={setEndsAt}
                  disabled={isSaving}
                />
              ) : null}

              {steps[currentStep].id === "meeting" ? (
                <section className="flex flex-col gap-4">
                  {attempted && structure.committees.length === 0 ? (
                    <FieldError>{t("platform_committee_required")}</FieldError>
                  ) : null}
                  {structure.committees.map((committee, committeeIndex) => {
                    const reference = committeeReference(
                      committee,
                      committeeIndex
                    )
                    const invalid = attempted && !committee.name.trim()
                    return (
                      <article
                        key={reference}
                        className="rounded-lg border p-4"
                      >
                        <div className="grid items-start gap-x-4 gap-y-3 md:grid-cols-[minmax(0,1fr)_11rem_auto]">
                          <div className="flex flex-col gap-2">
                            <Label htmlFor={`committee-name-${reference}`}>
                              {t("platform_venue_name")}
                            </Label>
                            <Input
                              id={`committee-name-${reference}`}
                              value={committee.name}
                              disabled={isSaving}
                              aria-invalid={invalid || undefined}
                              onChange={(event) =>
                                updateCommittee(committeeIndex, {
                                  name: event.target.value,
                                })
                              }
                            />
                            {invalid ? (
                              <FieldError>
                                {t("platform_venue_name_required")}
                              </FieldError>
                            ) : null}
                          </div>
                          <div className="flex flex-col gap-2">
                            <Label htmlFor={`committee-type-${reference}`}>
                              {t("platform_type")}
                            </Label>
                            <Select
                              value={committee.type}
                              items={Object.fromEntries(
                                Object.entries(committeeTypeLabels).map(
                                  ([key, label]) => [key, t(label)]
                                )
                              )}
                              disabled={isSaving}
                              onValueChange={(value) =>
                                changeCommitteeType(
                                  committeeIndex,
                                  value as CommitteeInput["type"]
                                )
                              }
                            >
                              <SelectTrigger
                                id={`committee-type-${reference}`}
                                className="h-8 w-full"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="cabinet">
                                  {t("platform_cabinet")}
                                </SelectItem>
                                <SelectItem value="mpc">MPC</SelectItem>
                                <SelectItem value="ipc">IPC</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-center justify-end md:pt-6">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title={t("platform_delete_committee")}
                              disabled={isSaving}
                              onClick={() =>
                                setStructure((current) => ({
                                  ...current,
                                  committees: current.committees.filter(
                                    (_, index) => index !== committeeIndex
                                  ),
                                }))
                              }
                            >
                              <Trash2
                                className="text-destructive"
                                aria-hidden
                              />
                            </Button>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                  <Button
                    type="button"
                    variant="outline"
                    className="w-fit"
                    disabled={isSaving}
                    onClick={() =>
                      setStructure((current) => ({
                        ...current,
                        committees: [
                          ...current.committees,
                          {
                            clientId: createClientId("committee"),
                            name: "",
                            type: "cabinet",
                            seats: [],
                            agenda: [],
                          },
                        ],
                      }))
                    }
                  >
                    <Plus aria-hidden />
                    {t("platform_add_venue")}
                  </Button>
                </section>
              ) : null}

              {steps[currentStep].id === "roles" ? (
                <section className="flex flex-col gap-4">
                  {attempted && structure.roleTemplates.length === 0 ? (
                    <FieldError>{t("platform_role_required")}</FieldError>
                  ) : null}
                  {structure.roleTemplates.map((role, roleIndex) => {
                    const reference = roleReference(role)
                    const nameInvalid = attempted && !role.name.trim()
                    const capabilitiesInvalid =
                      attempted &&
                      role.capabilities.length === 0 &&
                      !nameInvalid
                    const usage = structure.committees.reduce(
                      (total, committee) =>
                        total +
                        committee.seats.filter(
                          (seat) => seat.roleTemplateId === reference
                        ).length,
                      0
                    )
                    return (
                      <RoleCard
                        key={reference}
                        role={role}
                        roleIndex={roleIndex}
                        usage={usage}
                        disabled={isSaving}
                        nameInvalid={nameInvalid}
                        capabilitiesInvalid={capabilitiesInvalid}
                        onChange={updateRole}
                        onRemove={removeRole}
                      />
                    )
                  })}
                  <Button
                    type="button"
                    variant="outline"
                    className="w-fit"
                    disabled={isSaving}
                    onClick={() =>
                      setStructure((current) => ({
                        ...current,
                        roleTemplates: [
                          ...current.roleTemplates,
                          {
                            clientId: createClientId("role"),
                            name: "",
                            capabilities: ["view_conference"],
                          },
                        ],
                      }))
                    }
                  >
                    <Plus aria-hidden />
                    {t("platform_add_role")}
                  </Button>
                </section>
              ) : null}

              {steps[currentStep].id === "seats" ? (
                <section className="flex flex-col gap-4">
                  {structure.committees.map((committee, committeeIndex) => {
                    const committeeRef = committeeReference(
                      committee,
                      committeeIndex
                    )
                    const allowedRoles = structure.roleTemplates.filter(
                      (role) => roleAllowedInCommittee(role, committee.type)
                    )
                    const noSeats = attempted && committee.seats.length === 0
                    return (
                      <Collapsible
                        key={committeeRef}
                        className="rounded-lg border p-4"
                        open={!collapsedCommittees[committeeRef]}
                        onOpenChange={(open) =>
                          setCollapsedCommittees((current) => ({
                            ...current,
                            [committeeRef]: !open,
                          }))
                        }
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <h2 className="truncate text-sm font-semibold">
                              {committee.name ||
                                t("platform_unnamed_committee")}
                            </h2>
                            <Badge variant="outline">
                              {committee.seats.length}
                              {t("platform_seat_unit")}
                            </Badge>
                            <CollapsibleTrigger
                              render={
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                />
                              }
                              aria-label={t("platform_toggle_committee_seats", {
                                action: collapsedCommittees[committeeRef]
                                  ? t("platform_expand_seats")
                                  : t("platform_collapse_seats"),
                                value:
                                  committee.name ||
                                  t("platform_unnamed_committee"),
                              })}
                            >
                              <ChevronDown
                                className={cn(
                                  "transition-transform",
                                  !collapsedCommittees[committeeRef] &&
                                    "rotate-180"
                                )}
                                aria-hidden
                              />
                            </CollapsibleTrigger>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <SeatImportDialog
                              disabled={isSaving}
                              target={{
                                value: committeeRef,
                                label:
                                  committee.name ||
                                  t("platform_unnamed_committee"),
                              }}
                              roleLabel={importRoleLabel}
                              onImport={importSeats}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isSaving}
                              onClick={() => addSeat(committeeIndex)}
                            >
                              <Plus aria-hidden />
                              {t("platform_add_seat")}
                            </Button>
                          </div>
                        </div>
                        <CollapsibleContent>
                          <div className="mt-3 flex flex-col gap-2">
                            {committee.seats.length ? (
                              committee.seats.map((seat, seatIndex) => {
                                const seatRef = seatReference(seat, seatIndex)
                                const role = structure.roleTemplates.find(
                                  (item) =>
                                    roleReference(item) === seat.roleTemplateId
                                )
                                const nameInvalid =
                                  attempted && !seat.name.trim()
                                const roleInvalid =
                                  attempted &&
                                  (!role ||
                                    !roleAllowedInCommittee(
                                      role,
                                      committee.type
                                    ))
                                return (
                                  <div
                                    key={seatRef}
                                    className="flex flex-col gap-1"
                                  >
                                    <div className="grid items-center gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,12rem)_15rem_2.5rem]">
                                      <Input
                                        value={seat.name}
                                        disabled={isSaving}
                                        placeholder={t("platform_seat_name")}
                                        aria-label={t("platform_seat_name")}
                                        aria-invalid={nameInvalid || undefined}
                                        onChange={(event) =>
                                          updateSeat(
                                            committeeIndex,
                                            seatIndex,
                                            {
                                              name: event.target.value,
                                            }
                                          )
                                        }
                                      />
                                      <Input
                                        value={seat.shortName ?? ""}
                                        disabled={isSaving}
                                        placeholder={t(
                                          "platform_seat_short_name_optional"
                                        )}
                                        aria-label={t(
                                          "platform_seat_short_name"
                                        )}
                                        onChange={(event) =>
                                          updateSeat(
                                            committeeIndex,
                                            seatIndex,
                                            {
                                              shortName: event.target.value,
                                            }
                                          )
                                        }
                                      />
                                      <Select
                                        value={seat.roleTemplateId || null}
                                        items={allowedRoles.map(
                                          (allowedRole) => ({
                                            value: roleReference(allowedRole),
                                            label:
                                              allowedRole.name ||
                                              t("platform_unnamed_role"),
                                          })
                                        )}
                                        disabled={isSaving}
                                        onValueChange={(value) =>
                                          updateSeat(
                                            committeeIndex,
                                            seatIndex,
                                            {
                                              roleTemplateId: value ?? "",
                                            }
                                          )
                                        }
                                      >
                                        <SelectTrigger
                                          className="w-full"
                                          aria-label={t("platform_role")}
                                          aria-invalid={
                                            roleInvalid || undefined
                                          }
                                        >
                                          <SelectValue
                                            placeholder={t(
                                              "platform_select_role"
                                            )}
                                          />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {allowedRoles.map((allowedRole) => (
                                            <SelectItem
                                              key={roleReference(allowedRole)}
                                              value={roleReference(allowedRole)}
                                            >
                                              {allowedRole.name ||
                                                t("platform_unnamed_role")}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        title={t("platform_delete_seat")}
                                        disabled={isSaving}
                                        onClick={() =>
                                          updateCommittee(committeeIndex, {
                                            seats: committee.seats.filter(
                                              (_, index) => index !== seatIndex
                                            ),
                                          })
                                        }
                                      >
                                        <Trash2
                                          className="text-destructive"
                                          aria-hidden
                                        />
                                      </Button>
                                    </div>
                                    {nameInvalid ? (
                                      <FieldError>
                                        {t("platform_enter_seat_name")}
                                      </FieldError>
                                    ) : null}
                                    {roleInvalid ? (
                                      <FieldError>
                                        {t("platform_seat_role_mismatch")}
                                      </FieldError>
                                    ) : null}
                                  </div>
                                )
                              })
                            ) : (
                              <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                                {t("platform_no_seats_assigned")}
                              </p>
                            )}
                          </div>
                        </CollapsibleContent>
                        {noSeats ? (
                          <div className="mt-1">
                            <FieldError>
                              {t("platform_committee_seat_required")}
                            </FieldError>
                          </div>
                        ) : null}
                      </Collapsible>
                    )
                  })}
                </section>
              ) : null}

              {steps[currentStep].id === "review" ? (
                <div className="space-y-4">
                  <p className="text-sm">
                    {t("platform_starts_prefix")}
                    {formatSchedule(scheduleInstant(startsAt), locale)}
                    <br />
                    {t("platform_ends_prefix")}
                    {formatSchedule(scheduleInstant(endsAt), locale)}
                  </p>
                  <ReviewStep
                    name={name}
                    structure={structure}
                    totalSeats={totalSeats}
                    error={error}
                    fieldErrors={fieldErrors}
                  />
                </div>
              ) : null}
            </div>

            <footer className="sticky bottom-0 mt-6 flex items-center justify-between gap-3 bg-background/75 py-4 backdrop-blur-xl">
              <Button
                type="button"
                variant="ghost"
                disabled={currentStep === 0 || isSaving}
                onClick={() => goToStep(currentStep - 1)}
              >
                <ArrowLeft aria-hidden />
                {t("platform_previous")}
              </Button>
              {currentStep < steps.length - 1 ? (
                <Button
                  type="button"
                  disabled={isSaving}
                  onClick={() => goToStep(currentStep + 1)}
                >
                  {t("platform_next")}
                  <ArrowRight aria-hidden />
                </Button>
              ) : (
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? (
                    <Loader2 className="animate-spin" aria-hidden />
                  ) : (
                    <Check aria-hidden />
                  )}
                  {isSaving
                    ? t("platform_creating")
                    : t("platform_create_conference")}
                </Button>
              )}
            </footer>
          </div>
        </div>
      </form>
    </PlatformShell>
  )
}

function RoleCard({
  role,
  roleIndex,
  usage,
  disabled,
  nameInvalid,
  capabilitiesInvalid,
  onChange,
  onRemove,
}: {
  role: RoleTemplateInput
  roleIndex: number
  usage: number
  disabled: boolean
  nameInvalid: boolean
  capabilitiesInvalid: boolean
  onChange: (index: number, patch: Partial<RoleTemplateInput>) => void
  onRemove: (index: number) => void
}) {
  const { t, locale } = usePlatformTranslations()

  const [open, setOpen] = useState(false)
  const reference = roleReference(role)

  useEffect(() => {
    if (capabilitiesInvalid) setOpen(true)
  }, [capabilitiesInvalid])

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <article className="rounded-lg border p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-60 flex-1 flex-col gap-1.5">
            <Input
              value={role.name}
              disabled={disabled}
              placeholder={t("platform_role_name")}
              aria-label={t("platform_role_name")}
              aria-invalid={nameInvalid || undefined}
              className="max-w-72"
              onChange={(event) =>
                onChange(roleIndex, { name: event.target.value })
              }
            />
            {nameInvalid ? (
              <FieldError>{t("platform_enter_role_name")}</FieldError>
            ) : null}
          </div>
          <Badge variant={capabilitiesInvalid ? "destructive" : "outline"}>
            {role.capabilities.length}
            {t("platform_capability_unit")}
          </Badge>
          <CollapsibleTrigger
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon" }),
              "transition-transform",
              open && "rotate-180"
            )}
            aria-label={
              open
                ? t("platform_collapse_capabilities")
                : t("platform_expand_capabilities")
            }
            title={
              open
                ? t("platform_collapse_capabilities")
                : t("platform_expand_capabilities")
            }
          >
            <ChevronDown aria-hidden />
          </CollapsibleTrigger>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title={
              usage > 0 ? t("platform_role_in_use") : t("platform_delete_role")
            }
            disabled={disabled || usage > 0}
            onClick={() => onRemove(roleIndex)}
          >
            <Trash2 className="text-destructive" aria-hidden />
          </Button>
        </div>
        <CollapsibleContent>
          <fieldset className="mt-4">
            <legend className="text-sm font-medium">
              {t("platform_capabilities")}
            </legend>
            <div className="mt-3">
              <CapabilityPicker
                idPrefix={`capability-${reference}`}
                value={role.capabilities}
                disabled={disabled}
                onChange={(capabilities) =>
                  onChange(roleIndex, { capabilities })
                }
              />
            </div>
            {capabilitiesInvalid ? (
              <div className="mt-2">
                <FieldError>{t("platform_select_capability")}</FieldError>
              </div>
            ) : null}
          </fieldset>
        </CollapsibleContent>
      </article>
    </Collapsible>
  )
}

function ReviewStep({
  name,
  structure,
  totalSeats,
  error,
  fieldErrors,
}: {
  name: string
  structure: ConferenceStructure
  totalSeats: number
  error: string
  fieldErrors: string[]
}) {
  const { t, locale } = usePlatformTranslations()

  const [rolesOpen, setRolesOpen] = useState(true)
  return (
    <section className="flex flex-col gap-5">
      <article className="rounded-lg border p-4">
        <h2 className="truncate text-sm font-semibold">
          {name || t("platform_unnamed_conference")}
        </h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">
              {t("platform_creation_mode")}
            </dt>
            <dd className="mt-1 font-medium">
              {t("platform_conference_mode")}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              {t("platform_committee")}
            </dt>
            <dd className="mt-1 font-medium">{structure.committees.length}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              {t("platform_role_template")}
            </dt>
            <dd className="mt-1 font-medium">
              {structure.roleTemplates.length}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              {t("platform_seat")}
            </dt>
            <dd className="mt-1 font-medium">{totalSeats}</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-muted-foreground">
          {t("platform_draft_after_creation")}
        </p>
      </article>
      <div className="grid gap-4">
        {structure.committees.map((committee, committeeIndex) => (
          <ReviewCommittee
            key={committeeReference(committee, committeeIndex)}
            committee={committee}
            roles={structure.roleTemplates}
          />
        ))}
      </div>
      <Collapsible open={rolesOpen} onOpenChange={setRolesOpen}>
        <article className="rounded-lg border p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">
              {t("platform_role_capabilities")}
            </h3>
            <CollapsibleTrigger
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon" }),
                "transition-transform",
                rolesOpen && "rotate-180"
              )}
              aria-label={
                rolesOpen
                  ? t("platform_collapse_roles")
                  : t("platform_expand_roles")
              }
            >
              <ChevronDown aria-hidden />
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
            <div className="mt-3 flex flex-col gap-2">
              {structure.roleTemplates.map((role) => {
                const reference = roleReference(role)
                const usage = structure.committees.reduce(
                  (total, committee) =>
                    total +
                    committee.seats.filter(
                      (seat) => seat.roleTemplateId === reference
                    ).length,
                  0
                )
                return (
                  <div key={reference} className="rounded-md border px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-medium">
                        {role.name}
                      </span>
                      <Badge variant="outline">
                        {usage}
                        {t("platform_seat_unit")}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {role.capabilities
                        .map((capability) => t(CAPABILITY_LABELS[capability]))
                        .join(locale === "zh-CN" ? "、" : ", ")}
                    </p>
                  </div>
                )
              })}
            </div>
          </CollapsibleContent>
        </article>
      </Collapsible>
      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          <p>{error.startsWith("platform_") ? t(error) : error}</p>
          {fieldErrors.length ? (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {fieldErrors.map((fieldError, index) => (
                <li key={`${index}-${fieldError}`}>{fieldError}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function ReviewCommittee({
  committee,
  roles,
}: {
  committee: CommitteeInput
  roles: RoleTemplateInput[]
}) {
  const { t, locale } = usePlatformTranslations()

  const [open, setOpen] = useState(true)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <article className="rounded-lg border p-4">
        <div className="flex items-center gap-3">
          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">
            {committee.name}
          </h3>
          <Badge variant="outline">
            {t(committeeTypeLabels[committee.type])} ·{" "}
            {t("platform_seat_count", {
              value1: committee.seats.length,
            })}
          </Badge>
          <CollapsibleTrigger
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon" }),
              "transition-transform",
              open && "rotate-180"
            )}
            aria-label={
              open ? t("platform_collapse_seats") : t("platform_expand_seats")
            }
          >
            <ChevronDown aria-hidden />
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {committee.seats.map((seat, seatIndex) => (
              <li
                key={seatReference(seat, seatIndex)}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
              >
                <div className="min-w-0 flex-1 truncate">
                  <span>{seat.name}</span>
                  {seat.shortName?.trim() ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({seat.shortName})
                    </span>
                  ) : null}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {roles.find(
                    (role) => roleReference(role) === seat.roleTemplateId
                  )?.name || t("platform_unspecified_role")}
                </span>
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </article>
    </Collapsible>
  )
}
