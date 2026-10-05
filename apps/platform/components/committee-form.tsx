"use client"

import type { JSX } from "react"
import { Plus } from "lucide-react"
import type { ImportedSeat } from "@vetoexpress/utils/seat-import"
import type { SeatInviteExportRow } from "@vetoexpress/utils/seat-invite-export"

import { CommitteeSeatTable } from "@/components/committee-seat-table"
import { SeatImportDialog } from "@/components/seat-import-dialog"
import { SeatInviteExportDialog } from "@/components/seat-invite-export-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { CommitteeInput, RoleTemplateInput } from "@/lib/conference-client"
import {
  createClientId,
  roleAllowedInCommittee,
  roleReference,
} from "@/lib/conference-structure"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectItem,
  SelectContent,
} from "@/components/ui/select"

const selectClassName =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

const committeeTypeLabels: Record<CommitteeInput["type"], string> = {
  cabinet: "委员会 / Cabinet",
  mpc: "MPC",
  ipc: "IPC",
}

interface CommitteeFormProps {
  value: CommitteeInput
  roles: RoleTemplateInput[]
  disabled?: boolean
  allowExistingRemoval?: boolean
  onChange: (value: CommitteeInput) => void
}

export function CommitteeForm({
  value,
  roles,
  disabled = false,
  allowExistingRemoval = true,
  onChange,
}: CommitteeFormProps): JSX.Element {
  const reference = value.id ?? value.clientId ?? "committee"

  const exportRows: SeatInviteExportRow[] = value.seats.flatMap((seat) => {
    if (!seat.inviteCode) return []
    const role = roles.find(
      (item) => roleReference(item) === seat.roleTemplateId
    )
    return [
      {
        name: seat.name,
        shortName: seat.shortName,
        roleName: role?.name,
        inviteCode: seat.inviteCode,
      },
    ]
  })

  function roleReferenceForImportedName(roleName: string): string {
    const allowedRoles = roles.filter((role) =>
      roleAllowedInCommittee(role, value.type)
    )
    const normalized = roleName.replace(/\s+/g, "").toLowerCase()
    if (!normalized)
      return allowedRoles[0] ? roleReference(allowedRoles[0]) : ""
    const role = allowedRoles.find(
      (item) => item.name.replace(/\s+/g, "").toLowerCase() === normalized
    )
    return role ? roleReference(role) : ""
  }

  function importedRoleLabel(roleName: string): string {
    const reference = roleReferenceForImportedName(roleName)
    const role = roles.find((item) => roleReference(item) === reference)
    return role?.name || (roleName ? "未匹配角色" : "无可用角色")
  }

  function importSeats(seats: ImportedSeat[]): void {
    onChange({
      ...value,
      seats: [
        ...value.seats,
        ...seats.map((seat) => ({
          clientId: createClientId("seat"),
          name: seat.name,
          shortName: seat.shortName,
          roleTemplateId: roleReferenceForImportedName(seat.roleName ?? ""),
          hasVotingRights: seat.hasVotingRights ?? true,
        })),
      ],
    })
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`committee-name-${reference}`}>委员会名称</Label>
          <Input
            id={`committee-name-${reference}`}
            value={value.name}
            disabled={disabled}
            maxLength={120}
            onChange={(event) =>
              onChange({ ...value, name: event.target.value })
            }
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`committee-type-${reference}`}>委员会类型</Label>
          <Select
            value={value.type}
            items={committeeTypeLabels}
            disabled={disabled}
            onValueChange={(newValue) => {
              const type = newValue as CommitteeInput["type"]

              onChange({
                ...value,
                type,
                seats: value.seats.map((seat) => {
                  const role = roles.find(
                    (item) => roleReference(item) === seat.roleTemplateId
                  )

                  return role && !roleAllowedInCommittee(role, type)
                    ? { ...seat, roleTemplateId: "" }
                    : seat
                }),
              })
            }}
          >
            <SelectTrigger
              id={`committee-type-${reference}`}
              className={selectClassName}
            >
              <SelectValue placeholder="选择委员会类型" />
            </SelectTrigger>

            <SelectContent>
              {Object.entries(committeeTypeLabels).map(([type, label]) => (
                <SelectItem key={type} value={type}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <section
        className="flex flex-col gap-3"
        aria-labelledby={`seats-${reference}`}
      >
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 id={`seats-${reference}`} className="font-medium">
              席位
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              每个委员会至少需要一个席位。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SeatImportDialog
              disabled={disabled}
              target={{ value: reference, label: value.name || "未命名委员会" }}
              roleLabel={importedRoleLabel}
              onImport={importSeats}
            />
            <SeatInviteExportDialog
              filenameBase={value.name}
              rows={exportRows}
              missingCount={value.seats.length - exportRows.length}
              disabled={disabled}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() =>
                onChange({
                  ...value,
                  seats: [
                    ...value.seats,
                    {
                      clientId: createClientId("seat"),
                      name: "",
                      shortName: "",
                      roleTemplateId: "",
                      hasVotingRights: true,
                    },
                  ],
                })
              }
            >
              <Plus aria-hidden="true" />
              添加席位
            </Button>
          </div>
        </div>

        <CommitteeSeatTable
          seats={value.seats}
          roles={roles}
          committeeType={value.type}
          disabled={disabled}
          allowExistingRemoval={allowExistingRemoval}
          onChange={(seats) => onChange({ ...value, seats })}
        />
      </section>
    </div>
  )
}
