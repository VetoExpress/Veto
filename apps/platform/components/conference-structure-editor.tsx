"use client"
import { message } from "@/i18n/messages"
import { usePlatformTranslations } from "@/components/i18n-provider"

import { useState } from "react"
import type { JSX } from "react"
import { ChevronDown, Pencil, Plus } from "lucide-react"
import Link from "next/link"

import { CommitteeForm } from "@/components/committee-form"
import { CapabilityPicker } from "@/components/capability-picker"
import { ConfirmDeleteButton } from "@/components/confirm-delete-button"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  type CommitteeInput,
  type ConferenceStructure,
  type RoleTemplateInput,
} from "@/lib/conference-client"
import {
  committeeReference,
  createClientId,
  createCommittee,
  roleReference,
} from "@/lib/conference-structure"
import { cn } from "@/lib/utils"

const textareaClassName =
  "min-h-24 w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"

const committeeTypeLabels: Record<CommitteeInput["type"], string> = {
  cabinet: message("platform_committee_cabinet"),
  mpc: "MPC",
  ipc: "IPC",
}

const roleSystemLabels: Record<
  NonNullable<RoleTemplateInput["systemCode"]> | "custom",
  string
> = {
  custom: message("platform_custom_role"),
  staff: "Staff",
  mpc_press: message("platform_mpc_press"),
  ipc: "IPC",
}

function createRole(): RoleTemplateInput {
  return {
    clientId: createClientId("role"),
    name: "",
    description: "",
    capabilities: [],
  }
}

interface ConferenceStructureEditorProps {
  value: ConferenceStructure
  onChange: (value: ConferenceStructure) => void
  disabled?: boolean
  allowExistingRemoval?: boolean
  conferenceId?: string
}

export function ConferenceStructureEditor({
  value,
  onChange,
  disabled = false,
  allowExistingRemoval = true,
  conferenceId,
}: ConferenceStructureEditorProps): JSX.Element {
  const { t, locale } = usePlatformTranslations()

  const [rolesOpen, setRolesOpen] = useState(true)
  const [committeesOpen, setCommitteesOpen] = useState(true)
  const [editingRoleIndex, setEditingRoleIndex] = useState<number | null>(null)
  const [editingCommitteeIndex, setEditingCommitteeIndex] = useState<
    number | null
  >(null)

  const editingRole =
    editingRoleIndex === null
      ? undefined
      : value.roleTemplates[editingRoleIndex]
  const editingCommittee =
    editingCommitteeIndex === null
      ? undefined
      : value.committees[editingCommitteeIndex]

  function updateRole(index: number, patch: Partial<RoleTemplateInput>): void {
    const roles = [...value.roleTemplates]
    roles[index] = { ...roles[index], ...patch }
    onChange({ ...value, roleTemplates: roles })
  }

  function addRole(): void {
    const index = value.roleTemplates.length
    onChange({
      ...value,
      roleTemplates: [...value.roleTemplates, createRole()],
    })
    setEditingRoleIndex(index)
    setRolesOpen(true)
  }

  function removeRole(index: number): void {
    onChange({
      ...value,
      roleTemplates: value.roleTemplates.filter(
        (_, itemIndex) => itemIndex !== index
      ),
    })
    if (editingRoleIndex === index) setEditingRoleIndex(null)
  }

  function addCommittee(): void {
    const index = value.committees.length
    onChange({
      ...value,
      committees: [...value.committees, createCommittee()],
    })
    setEditingCommitteeIndex(index)
    setCommitteesOpen(true)
  }

  function updateCommittee(index: number, committee: CommitteeInput): void {
    const committees = [...value.committees]
    committees[index] = committee
    onChange({ ...value, committees })
  }

  function removeCommittee(index: number): void {
    onChange({
      ...value,
      committees: value.committees.filter(
        (_, itemIndex) => itemIndex !== index
      ),
    })
    if (editingCommitteeIndex === index) setEditingCommitteeIndex(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <Collapsible open={rolesOpen} onOpenChange={setRolesOpen}>
        <section
          className="rounded-xl border bg-card"
          aria-labelledby="roles-heading"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id="roles-heading"
                  className="text-lg font-semibold tracking-tight"
                >
                  {t("platform_roles_and_capabilities")}
                </h2>
                <Badge variant="secondary">{value.roleTemplates.length}</Badge>
              </div>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {t("platform_role_configuration_hint")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={addRole}
              >
                <Plus aria-hidden="true" />
                {t("platform_add_role")}
              </Button>
              <CollapsibleTrigger
                render={<Button type="button" variant="ghost" size="icon" />}
                aria-label={
                  rolesOpen
                    ? t("platform_collapse_role_section")
                    : t("platform_expand_role_section")
                }
              >
                <ChevronDown
                  className={cn(rolesOpen && "rotate-180")}
                  aria-hidden="true"
                />
              </CollapsibleTrigger>
            </div>
          </div>

          <CollapsibleContent className="border-t p-4 sm:p-5">
            {value.roleTemplates.length === 0 ? (
              <div className="rounded-xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">
                {t("platform_no_roles")}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {value.roleTemplates.map((role, roleIndex) => {
                  const reference = roleReference(role)
                  const inUse = value.committees.some((committee) =>
                    committee.seats.some(
                      (seat) => seat.roleTemplateId === reference
                    )
                  )
                  return (
                    <Card
                      key={reference}
                      className="relative gap-3 bg-muted/25 py-4 shadow-none ring-0 transition-colors hover:bg-muted/45"
                    >
                      <button
                        type="button"
                        className="absolute inset-0 rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
                        disabled={disabled}
                        onClick={() => setEditingRoleIndex(roleIndex)}
                      >
                        <span className="sr-only">
                          {t("platform_edit")}
                          {role.name.trim() ||
                            t("platform_role_number", {
                              value1: roleIndex + 1,
                            })}
                        </span>
                      </button>
                      <CardHeader className="pointer-events-none relative px-4">
                        <CardTitle className="truncate text-base">
                          {role.name.trim() ||
                            t("platform_role_number", {
                              value1: roleIndex + 1,
                            })}
                        </CardTitle>
                        <p className="line-clamp-2 text-sm leading-5 text-muted-foreground">
                          {role.description?.trim() ||
                            t("platform_no_role_description")}
                        </p>
                      </CardHeader>
                      <CardContent className="relative flex flex-wrap items-center justify-between gap-3 px-4">
                        <div className="pointer-events-none flex flex-wrap items-center gap-2">
                          {role.systemCode ? (
                            <Badge variant="outline">
                              {t("platform_system_role")}
                            </Badge>
                          ) : null}
                          <span className="text-xs text-muted-foreground">
                            {role.capabilities.length}
                            {t("platform_capability_unit")}
                          </span>
                        </div>
                        <div className="relative flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={disabled}
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              setEditingRoleIndex(roleIndex)
                            }}
                          >
                            <Pencil aria-hidden="true" />
                            {t("platform_edit")}
                          </Button>
                          <ConfirmDeleteButton
                            disabled={
                              disabled ||
                              inUse ||
                              (!allowExistingRemoval && Boolean(role.id))
                            }
                            disabledLabel={
                              inUse
                                ? t("platform_role_assigned")
                                : !allowExistingRemoval && role.id
                                  ? t("platform_active_role_retained")
                                  : undefined
                            }
                            onConfirm={() => removeRole(roleIndex)}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </CollapsibleContent>
        </section>
      </Collapsible>

      <Collapsible open={committeesOpen} onOpenChange={setCommitteesOpen}>
        <section
          className="rounded-xl border bg-card"
          aria-labelledby="committees-heading"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id="committees-heading"
                  className="text-lg font-semibold tracking-tight"
                >
                  {t("platform_committees_and_seats")}
                </h2>
                <Badge variant="secondary">{value.committees.length}</Badge>
              </div>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {t("platform_committee_needs_seat")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {conferenceId && !disabled ? (
                <Link
                  href={`/conferences/${conferenceId}/committees/new`}
                  className={buttonVariants({ variant: "outline" })}
                >
                  <Plus aria-hidden="true" />
                  {t("platform_add_committee")}
                </Link>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  disabled={disabled}
                  onClick={addCommittee}
                >
                  <Plus aria-hidden="true" />
                  {t("platform_add_committee")}
                </Button>
              )}
              <CollapsibleTrigger
                render={<Button type="button" variant="ghost" size="icon" />}
                aria-label={
                  committeesOpen
                    ? t("platform_collapse_committee_section")
                    : t("platform_expand_committee_section")
                }
              >
                <ChevronDown
                  className={cn(committeesOpen && "rotate-180")}
                  aria-hidden="true"
                />
              </CollapsibleTrigger>
            </div>
          </div>

          <CollapsibleContent className="border-t p-4 sm:p-5">
            {value.committees.length === 0 ? (
              <div className="rounded-xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">
                {t("platform_no_committees")}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {value.committees.map((committee, committeeIndex) => {
                  const reference = committeeReference(
                    committee,
                    committeeIndex
                  )
                  const href =
                    conferenceId && !disabled
                      ? `/conferences/${conferenceId}/committees/${reference}`
                      : undefined
                  return (
                    <Card
                      key={reference}
                      className="relative gap-3 bg-muted/25 py-4 shadow-none ring-0 transition-colors hover:bg-muted/45"
                    >
                      {href ? (
                        <Link
                          href={href}
                          className="absolute inset-0 rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
                        >
                          <span className="sr-only">
                            {t("platform_edit")}
                            {committee.name.trim() ||
                              t("platform_committee_number", {
                                value1: committeeIndex + 1,
                              })}
                          </span>
                        </Link>
                      ) : (
                        <button
                          type="button"
                          className="absolute inset-0 rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
                          disabled={disabled}
                          onClick={() =>
                            setEditingCommitteeIndex(committeeIndex)
                          }
                        >
                          <span className="sr-only">
                            {t("platform_edit")}
                            {committee.name.trim() ||
                              t("platform_committee_number", {
                                value1: committeeIndex + 1,
                              })}
                          </span>
                        </button>
                      )}
                      <CardHeader className="pointer-events-none relative px-4">
                        <CardTitle className="truncate text-base">
                          {committee.name.trim() ||
                            t("platform_committee_number", {
                              value1: committeeIndex + 1,
                            })}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {t(committeeTypeLabels[committee.type])}
                        </p>
                      </CardHeader>
                      <CardContent className="relative flex flex-wrap items-center justify-between gap-3 px-4">
                        <span className="pointer-events-none text-xs text-muted-foreground">
                          {committee.seats.length}
                          {t("platform_seat_unit")}
                        </span>
                        <div className="relative flex items-center gap-1">
                          {href ? (
                            <Link
                              href={href}
                              className={buttonVariants({
                                variant: "ghost",
                                size: "sm",
                              })}
                            >
                              <Pencil aria-hidden="true" />
                              {t("platform_edit")}
                            </Link>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={disabled}
                              onClick={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                setEditingCommitteeIndex(committeeIndex)
                              }}
                            >
                              <Pencil aria-hidden="true" />
                              {t("platform_edit")}
                            </Button>
                          )}
                          <ConfirmDeleteButton
                            disabled={
                              disabled ||
                              (!allowExistingRemoval && Boolean(committee.id))
                            }
                            onConfirm={() => removeCommittee(committeeIndex)}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </CollapsibleContent>
        </section>
      </Collapsible>

      <Dialog
        open={editingRole !== undefined}
        onOpenChange={(open) => {
          if (!open) setEditingRoleIndex(null)
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingRole?.name.trim() || t("platform_edit_role")}
            </DialogTitle>
            <DialogDescription>
              {t("platform_role_editor_hint")}
            </DialogDescription>
          </DialogHeader>
          {editingRole && editingRoleIndex !== null ? (
            <div className="flex flex-col gap-5 py-2">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`role-name-${roleReference(editingRole)}`}>
                    {t("platform_role_name")}
                  </Label>
                  <Input
                    id={`role-name-${roleReference(editingRole)}`}
                    value={editingRole.name}
                    disabled={disabled}
                    maxLength={120}
                    onChange={(event) =>
                      updateRole(editingRoleIndex, {
                        name: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`role-system-${roleReference(editingRole)}`}>
                    {t("platform_role_type")}
                  </Label>
                  <Select
                    value={editingRole.systemCode ?? "custom"}
                    items={Object.fromEntries(
                      Object.entries(roleSystemLabels).map(([key, label]) => [
                        key,
                        t(label),
                      ])
                    )}
                    disabled={disabled}
                    onValueChange={(newValue) =>
                      updateRole(editingRoleIndex, {
                        systemCode:
                          newValue === "custom"
                            ? undefined
                            : (newValue as RoleTemplateInput["systemCode"]),
                      })
                    }
                  >
                    <SelectTrigger
                      id={`role-system-${roleReference(editingRole)}`}
                      className="h-9 w-full"
                    >
                      <SelectValue
                        placeholder={t("platform_select_role_type")}
                      />
                    </SelectTrigger>

                    <SelectContent>
                      <SelectItem value="custom">
                        {t("platform_custom_role")}
                      </SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="mpc_press">
                        {t("platform_mpc_press")}
                      </SelectItem>
                      <SelectItem value="ipc">IPC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label
                  htmlFor={`role-description-${roleReference(editingRole)}`}
                >
                  {t("platform_role_description")}
                </Label>
                <Input
                  id={`role-description-${roleReference(editingRole)}`}
                  value={editingRole.description ?? ""}
                  disabled={disabled}
                  maxLength={2000}
                  onChange={(event) =>
                    updateRole(editingRoleIndex, {
                      description: event.target.value,
                    })
                  }
                />
              </div>
              <fieldset>
                <legend className="text-sm font-medium">
                  {t("platform_capabilities")}
                </legend>
                <div className="mt-3">
                  <CapabilityPicker
                    value={editingRole.capabilities}
                    disabled={disabled}
                    gridClassName="sm:grid-cols-2"
                    onChange={(capabilities) =>
                      updateRole(editingRoleIndex, { capabilities })
                    }
                  />
                </div>
              </fieldset>
            </div>
          ) : null}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              {t("platform_done")}
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!conferenceId && editingCommittee !== undefined}
        onOpenChange={(open) => {
          if (!open) setEditingCommitteeIndex(null)
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {editingCommittee?.name.trim() || t("platform_edit_committee")}
            </DialogTitle>
            <DialogDescription>
              {t("platform_committee_editor_hint")}
            </DialogDescription>
          </DialogHeader>
          {editingCommittee && editingCommitteeIndex !== null ? (
            <CommitteeForm
              value={editingCommittee}
              roles={value.roleTemplates}
              disabled={disabled}
              allowExistingRemoval={allowExistingRemoval}
              onChange={(committee) =>
                updateCommittee(editingCommitteeIndex, committee)
              }
            />
          ) : null}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              {t("platform_done")}
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export { textareaClassName }
