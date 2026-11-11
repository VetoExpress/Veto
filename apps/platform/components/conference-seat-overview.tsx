"use client"
import { message } from "@/i18n/messages"
import { usePlatformTranslations } from "@/components/i18n-provider"

import { useCallback, useEffect, useRef, useState } from "react"
import type { JSX } from "react"
import { Check, Copy } from "lucide-react"
import Link from "next/link"
import type { SeatInviteExportRow } from "@vetoexpress/utils/seat-invite-export"

import { SeatInviteExportDialog } from "@/components/seat-invite-export-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  listOrganizerSeatAccess,
  resetOrganizerSeatUser,
  type OrganizerSeatAccess,
} from "@/lib/conference-client"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type {
  CommitteeInput,
  Conference,
  SeatInput,
} from "@/lib/conference-client"
import { committeeReference, roleReference } from "@/lib/conference-structure"

const COMMITTEE_FILTER_ALL = "all"

interface ConferenceSeatOverviewProps {
  conference: Conference
  token: string
  hasUnsavedStructure?: boolean
}

interface SeatOverviewRow {
  committee: CommitteeInput
  committeeIndex: number
  seat: SeatInput
  seatIndex: number
  reference: string
}

export function ConferenceSeatOverview({
  conference,
  token,
  hasUnsavedStructure = false,
}: ConferenceSeatOverviewProps): JSX.Element {
  const { t, locale } = usePlatformTranslations()

  const [query, setQuery] = useState("")
  const [committeeFilter, setCommitteeFilter] = useState(COMMITTEE_FILTER_ALL)
  const [copied, setCopied] = useState("")
  const [claimFilter, setClaimFilter] = useState("all")
  const [access, setAccess] = useState<OrganizerSeatAccess[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [resetTarget, setResetTarget] = useState<OrganizerSeatAccess>()
  const [reason, setReason] = useState("")
  const [resetting, setResetting] = useState(false)
  const requestSequence = useRef(0)
  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current
    setLoading(true)
    setLoaded(false)
    setError("")
    try {
      const next = await listOrganizerSeatAccess(token, conference.id)
      if (sequence !== requestSequence.current) return
      setAccess(next)
      setLoaded(true)
    } catch (caught) {
      if (sequence === requestSequence.current)
        setError(
          caught instanceof Error
            ? caught.message
            : message("platform_load_claims_failed")
        )
    } finally {
      if (sequence === requestSequence.current) setLoading(false)
    }
  }, [token, conference.id])
  useEffect(() => {
    void refresh()
    return () => {
      requestSequence.current++
    }
  }, [refresh])
  const accessBySeat = new Map(access.map((item) => [item.seatId, item]))
  async function resetClaim() {
    if (!resetTarget?.user || !reason.trim() || resetting) return
    setResetting(true)
    setError("")
    try {
      await resetOrganizerSeatUser(
        token,
        conference.id,
        resetTarget.seatId,
        resetTarget.user.id,
        reason.trim()
      )
      setResetTarget(undefined)
      setReason("")
      await refresh()
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : message("platform_reset_claim_failed")
      )
    } finally {
      setResetting(false)
    }
  }
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const roleByReference = new Map(
    conference.roleTemplates.map((role) => [roleReference(role), role])
  )

  const rows: SeatOverviewRow[] = conference.committees.flatMap(
    (committee, committeeIndex) =>
      committee.seats.map((seat, seatIndex) => ({
        committee,
        committeeIndex,
        seat,
        seatIndex,
        reference: `${committeeIndex}:${seat.id ?? seat.clientId ?? seatIndex}`,
      }))
  )

  const committeeFilterItems = {
    [COMMITTEE_FILTER_ALL]: t("platform_all_committees"),
    ...Object.fromEntries(
      conference.committees.map((committee, committeeIndex) => [
        committeeReference(committee, committeeIndex),
        committee.name.trim() ||
          t("platform_committee_number", { value1: committeeIndex + 1 }),
      ])
    ),
  }

  const normalizedQuery = query.trim().toLowerCase()
  const filteredRows =
    committeeFilter === COMMITTEE_FILTER_ALL &&
    !normalizedQuery &&
    claimFilter === "all"
      ? rows
      : rows.filter((row) => {
          const entry = loaded ? accessBySeat.get(row.seat.id ?? "") : undefined
          if (claimFilter === "claimed" && !entry?.user) return false
          if (claimFilter === "unclaimed" && (!entry || entry.user))
            return false
          if (
            committeeFilter !== COMMITTEE_FILTER_ALL &&
            committeeReference(row.committee, row.committeeIndex) !==
              committeeFilter
          ) {
            return false
          }
          if (!normalizedQuery) return true
          const role = roleByReference.get(row.seat.roleTemplateId)
          return [
            row.seat.name,
            row.seat.shortName,
            role?.name,
            row.committee.name,
            entry?.user?.displayName,
          ].some((value) => value?.toLowerCase().includes(normalizedQuery))
        })

  const votingCount = rows.filter((row) => row.seat.hasVotingRights).length
  const withKeyCount = rows.filter((row) => row.seat.inviteCode).length

  const exportRows: SeatInviteExportRow[] = rows.flatMap(
    ({ committee, seat }) => {
      if (!seat.inviteCode) return []
      const role = roleByReference.get(seat.roleTemplateId)
      return [
        {
          committeeName: committee.name.trim() || undefined,
          name: seat.name,
          shortName: seat.shortName,
          roleName: role?.name,
          inviteCode: seat.inviteCode,
        },
      ]
    }
  )

  async function copyCode(code: string, reference: string): Promise<void> {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      setError("platform_copy_failed")
      return
    }
    if (copiedTimer.current) clearTimeout(copiedTimer.current)
    setCopied(reference)
    copiedTimer.current = setTimeout(() => setCopied(""), 1400)
  }

  function clearFilters(): void {
    setQuery("")
    setCommitteeFilter(COMMITTEE_FILTER_ALL)
    setClaimFilter("all")
  }

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
    },
    []
  )

  return (
    <section
      className="flex flex-col gap-6"
      aria-labelledby="seat-overview-heading"
    >
      <div>
        <h2
          id="seat-overview-heading"
          className="text-xl font-semibold tracking-tight"
        >
          {t("platform_seat_overview")}
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {t("platform_seat_overview_intro")}
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm">
          {t("platform_claim_status")}
          <select
            aria-label={t("platform_claim_status")}
            className="rounded-md border bg-background p-2"
            value={claimFilter}
            onChange={(event) => setClaimFilter(event.target.value)}
            disabled={!loaded}
          >
            <option value="all">{t("platform_all_statuses")}</option>
            <option value="unclaimed">{t("platform_unclaimed")}</option>
            <option value="claimed">{t("platform_claimed")}</option>
          </select>
        </label>
        <Button
          variant="outline"
          size="sm"
          disabled={loading || resetting}
          onClick={() => void refresh()}
        >
          {loading ? t("platform_refreshing") : t("platform_refresh_claims")}
        </Button>
        <span role="status" className="text-sm text-muted-foreground">
          {loaded
            ? t("platform_claimed_count", {
                value1: access.filter((item) => item.user).length,
                value2: access.length,
              })
            : t("platform_claims_unavailable")}
        </span>
      </div>
      <Dialog
        open={!!resetTarget}
        onOpenChange={(open) => {
          if (!open && !resetting) setResetTarget(undefined)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("platform_reset_seat_claim")}</DialogTitle>
            <DialogDescription>
              {t("platform_reset_claim_start")}
              {resetTarget?.user?.displayName}
              {t("platform_reset_claim_end")}
            </DialogDescription>
          </DialogHeader>
          <label className="text-sm">
            {t("platform_reset_reason")}
            <Input
              value={reason}
              maxLength={500}
              disabled={resetting}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t("platform_reset_reason_example")}
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            variant="destructive"
            disabled={resetting || !reason.trim()}
            onClick={() => void resetClaim()}
          >
            {resetting
              ? t("platform_resetting")
              : t("platform_confirm_reset_claim")}
          </Button>
        </DialogContent>
      </Dialog>

      {hasUnsavedStructure ? (
        <p className="rounded-xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          {t("platform_overview_unsaved_structure")}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">
          {t("platform_overview_no_seats_hint")}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-sm text-muted-foreground">
              {t("platform_total_prefix")}
              {rows.length}
              {t("platform_seat_stats_suffix")}
              {votingCount}
              {t("platform_voting_stats_suffix")} {withKeyCount}
              {t("platform_invite_stats_suffix")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={query}
                placeholder={t("platform_search_seats_placeholder")}
                aria-label={t("platform_search_seats")}
                className="h-9 w-full sm:w-60"
                onChange={(event) => setQuery(event.target.value)}
              />
              <Select
                value={committeeFilter}
                items={committeeFilterItems}
                onValueChange={(nextValue) =>
                  setCommitteeFilter(nextValue as string)
                }
              >
                <SelectTrigger
                  className="h-9 w-full sm:w-44"
                  aria-label={t("platform_filter_committee")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(committeeFilterItems).map(
                    ([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
              <SeatInviteExportDialog
                filenameBase={conference.name}
                rows={exportRows}
                description="platform_export_all_invites_hint"
                missingCount={rows.length - exportRows.length}
              />
            </div>
          </div>

          {filteredRows.length === 0 ? (
            <div className="rounded-xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">
              {t("platform_no_matching_seats")}
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={clearFilters}
                >
                  {t("platform_clear_filters")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">
                      {t("platform_committee")}
                    </th>
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
                      {t("platform_claimant_troubleshooting")}
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      {t("platform_access_key")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const role = roleByReference.get(row.seat.roleTemplateId)
                    return (
                      <tr key={row.reference} className="border-t align-middle">
                        <td className="px-4 py-3">
                          <Link
                            href={`/conferences/${conference.id}/committees/${committeeReference(row.committee, row.committeeIndex)}`}
                            className="font-medium underline-offset-4 hover:underline"
                          >
                            {row.committee.name.trim() ||
                              t("platform_committee_number", {
                                value1: row.committeeIndex + 1,
                              })}
                          </Link>
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {row.seat.name || t("platform_unnamed_seat")}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {row.seat.shortName || "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {role?.name || t("platform_not_selected")}
                        </td>
                        <td className="px-4 py-3">
                          {row.seat.hasVotingRights
                            ? t("platform_yes")
                            : t("platform_no")}
                        </td>
                        <td className="px-4 py-3">
                          {loaded && accessBySeat.has(row.seat.id ?? "") ? (
                            <div className="space-y-1">
                              <p>
                                {accessBySeat.get(row.seat.id!)?.user
                                  ?.displayName ?? t("platform_unclaimed")}
                              </p>
                              {accessBySeat.get(row.seat.id!)?.user &&
                                conference.lifecycle !== "closed" && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={resetting}
                                    onClick={() => {
                                      setResetTarget(
                                        accessBySeat.get(row.seat.id!)
                                      )
                                      setReason("")
                                      setError("")
                                    }}
                                  >
                                    {t("platform_reset_claim")}
                                  </Button>
                                )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">
                              {t("platform_unknown_status")}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {row.seat.inviteCode ? (
                            <div className="flex items-center gap-1">
                              <code className="font-mono text-xs">
                                {row.seat.inviteCode}
                              </code>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                title={t("platform_copy_key")}
                                aria-label={t("platform_copy_key")}
                                onClick={() =>
                                  void copyCode(
                                    row.seat.inviteCode ?? "",
                                    row.reference
                                  )
                                }
                              >
                                {copied === row.reference ? (
                                  <Check aria-hidden="true" />
                                ) : (
                                  <Copy aria-hidden="true" />
                                )}
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {t("platform_not_generated")}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}
