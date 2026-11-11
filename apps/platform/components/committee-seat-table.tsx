"use client"
import { message } from "@/i18n/messages"
import { usePlatformTranslations } from "@/components/i18n-provider"

import { useEffect, useRef, useState } from "react"
import type { JSX, KeyboardEvent } from "react"
import { Check, Copy, Pencil, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type {
  CommitteeType,
  RoleTemplateInput,
  SeatInput,
} from "@/lib/conference-client"
import {
  roleAllowedInCommittee,
  roleReference,
} from "@/lib/conference-structure"

const selectClassName =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

interface CommitteeSeatTableProps {
  seats: SeatInput[]
  roles: RoleTemplateInput[]
  committeeType: CommitteeType
  disabled?: boolean
  allowExistingRemoval?: boolean
  onChange: (seats: SeatInput[]) => void
}

function seatReference(seat: SeatInput, index: number): string {
  return seat.id ?? seat.clientId ?? String(index)
}

export function CommitteeSeatTable({
  seats,
  roles,
  committeeType,
  disabled = false,
  allowExistingRemoval = true,
  onChange,
}: CommitteeSeatTableProps): JSX.Element {
  const { t, locale } = usePlatformTranslations()

  const knownSeats = useRef(new Set(seats.map(seatReference)))
  const deleteTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [copied, setCopied] = useState("")
  const [editing, setEditing] = useState("")
  const [editName, setEditName] = useState("")
  const [editShortName, setEditShortName] = useState("")
  const [editRole, setEditRole] = useState("")
  const [editVotingRights, setEditVotingRights] = useState(true)
  const [deleteConfirm, setDeleteConfirm] = useState("")

  const allowedRoles = roles.filter((role) =>
    roleAllowedInCommittee(role, committeeType)
  )

  function startEditing(seat: SeatInput, index: number): void {
    clearDeleteConfirmation()
    setEditing(seatReference(seat, index))
    setEditName(seat.name)
    setEditShortName(seat.shortName ?? "")
    setEditRole(seat.roleTemplateId)
    setEditVotingRights(seat.hasVotingRights)
  }

  function cancelEditing(): void {
    setEditing("")
    setEditName("")
    setEditShortName("")
    setEditRole("")
    setEditVotingRights(true)
  }

  function saveSeat(index: number): void {
    const name = editName.trim()
    if (!name || !editRole) return
    const next = [...seats]
    next[index] = {
      ...next[index],
      name,
      shortName: editShortName.trim() || undefined,
      roleTemplateId: editRole,
      hasVotingRights: editVotingRights,
    }
    onChange(next)
    cancelEditing()
  }

  function handleEditorKeyDown(
    event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    index: number
  ): void {
    if (event.key === "Enter") {
      event.preventDefault()
      saveSeat(index)
    } else if (event.key === "Escape") {
      event.preventDefault()
      cancelEditing()
    }
  }

  function clearDeleteConfirmation(): void {
    if (deleteTimer.current) clearTimeout(deleteTimer.current)
    deleteTimer.current = undefined
    setDeleteConfirm("")
  }

  function handleDelete(seat: SeatInput, index: number): void {
    const reference = seatReference(seat, index)
    if (deleteConfirm !== reference) {
      clearDeleteConfirmation()
      setDeleteConfirm(reference)
      deleteTimer.current = setTimeout(clearDeleteConfirmation, 3000)
      return
    }

    clearDeleteConfirmation()
    if (editing === reference) cancelEditing()
    onChange(seats.filter((_, seatIndex) => seatIndex !== index))
  }

  async function copyCode(code: string, reference: string): Promise<void> {
    if (!code) return
    await navigator.clipboard.writeText(code)
    if (copiedTimer.current) clearTimeout(copiedTimer.current)
    setCopied(reference)
    copiedTimer.current = setTimeout(() => setCopied(""), 1400)
  }

  useEffect(() => {
    const currentReferences = new Set(seats.map(seatReference))
    const addedIndex = seats.findIndex(
      (seat, index) =>
        !knownSeats.current.has(seatReference(seat, index)) && !seat.name.trim()
    )
    knownSeats.current = currentReferences
    if (addedIndex >= 0) startEditing(seats[addedIndex], addedIndex)
  }, [seats])

  useEffect(
    () => () => {
      if (deleteTimer.current) clearTimeout(deleteTimer.current)
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
    },
    []
  )

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-3 text-left font-medium">
              {t("platform_seat")}
            </th>
            <th className="px-4 py-3 text-left font-medium">
              {t("platform_short_name")}
            </th>
            <th className="px-4 py-3 text-left font-medium">
              {t("platform_role")}
            </th>
            <th className="px-4 py-3 text-left font-medium">
              {t("platform_voting_rights")}
            </th>
            <th className="px-4 py-3 text-left font-medium">
              {t("platform_access_key")}
            </th>
            <th className="px-4 py-3 text-center font-medium">
              {t("platform_actions")}
            </th>
          </tr>
        </thead>
        <tbody>
          {seats.map((seat, index) => {
            const reference = seatReference(seat, index)
            const isEditing = editing === reference
            const role = roles.find(
              (item) => roleReference(item) === seat.roleTemplateId
            )
            return (
              <tr key={reference} className="border-t align-middle">
                <td className="px-4 py-3 font-medium">
                  {isEditing ? (
                    <Input
                      value={editName}
                      disabled={disabled}
                      aria-label={t("platform_seat_name")}
                      onChange={(event) => setEditName(event.target.value)}
                      onKeyDown={(event) => handleEditorKeyDown(event, index)}
                    />
                  ) : (
                    seat.name || t("platform_unnamed_seat")
                  )}
                </td>
                <td className="px-4 py-3">
                  {isEditing ? (
                    <Input
                      value={editShortName}
                      disabled={disabled}
                      maxLength={32}
                      placeholder={t("platform_optional")}
                      aria-label={t("platform_seat_short_name")}
                      onChange={(event) => setEditShortName(event.target.value)}
                      onKeyDown={(event) => handleEditorKeyDown(event, index)}
                    />
                  ) : (
                    seat.shortName || "—"
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {isEditing ? (
                    <select
                      value={editRole}
                      disabled={disabled}
                      className={selectClassName}
                      aria-label={t("platform_seat_role")}
                      onChange={(event) => setEditRole(event.target.value)}
                      onKeyDown={(event) => handleEditorKeyDown(event, index)}
                    >
                      <option value="">{t("platform_select_role")}</option>
                      {allowedRoles.map((allowedRole) => (
                        <option
                          key={roleReference(allowedRole)}
                          value={roleReference(allowedRole)}
                        >
                          {allowedRole.name || t("platform_unnamed_role")}
                        </option>
                      ))}
                    </select>
                  ) : (
                    role?.name || t("platform_not_selected")
                  )}
                </td>
                <td className="px-4 py-3">
                  {isEditing ? (
                    <label className="flex h-9 items-center gap-2 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={editVotingRights}
                        disabled={disabled}
                        onChange={(event) =>
                          setEditVotingRights(event.target.checked)
                        }
                      />
                      {t("platform_has_voting_rights")}
                    </label>
                  ) : seat.hasVotingRights ? (
                    t("platform_yes")
                  ) : (
                    t("platform_no")
                  )}
                </td>
                <td className="px-4 py-3">
                  <code className="font-mono text-xs">
                    {seat.inviteCode || t("platform_not_generated")}
                  </code>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title={t("platform_copy_key")}
                      aria-label={t("platform_copy_key")}
                      disabled={disabled || !seat.inviteCode}
                      onClick={() =>
                        void copyCode(seat.inviteCode ?? "", reference)
                      }
                    >
                      {copied === reference ? (
                        <Check aria-hidden="true" />
                      ) : (
                        <Copy aria-hidden="true" />
                      )}
                    </Button>
                    {isEditing ? (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title={t("platform_cancel_edit")}
                          aria-label={t("platform_cancel_edit")}
                          disabled={disabled}
                          onClick={cancelEditing}
                        >
                          <X aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title={t("platform_save_seat")}
                          aria-label={t("platform_save_seat")}
                          disabled={disabled || !editName.trim() || !editRole}
                          onClick={() => saveSeat(index)}
                        >
                          <Check aria-hidden="true" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title={t("platform_edit_seat")}
                        aria-label={t("platform_edit_seat")}
                        disabled={disabled}
                        onClick={() => startEditing(seat, index)}
                      >
                        <Pencil aria-hidden="true" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={
                        disabled || (!allowExistingRemoval && Boolean(seat.id))
                      }
                      className={
                        deleteConfirm === reference
                          ? "bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive"
                          : undefined
                      }
                      title={
                        deleteConfirm === reference
                          ? t("platform_click_confirm_delete")
                          : t("platform_delete_seat")
                      }
                      onClick={() => handleDelete(seat, index)}
                    >
                      <Trash2 aria-hidden="true" />
                      {t("platform_delete")}
                    </Button>
                  </div>
                </td>
              </tr>
            )
          })}
          {seats.length === 0 ? (
            <tr>
              <td
                colSpan={6}
                className="px-4 py-10 text-center text-muted-foreground"
              >
                {t("platform_no_seats")}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}
