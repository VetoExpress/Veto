"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { JSX } from "react"
import { Check, Copy } from "lucide-react"
import Link from "next/link"
import type { SeatInviteExportRow } from "@vetoexpress/utils/seat-invite-export"

import { SeatInviteExportDialog } from "@/components/seat-invite-export-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { listOrganizerSeatAccess, resetOrganizerSeatUser, type OrganizerSeatAccess } from "@/lib/conference-client"
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
      if (sequence === requestSequence.current) setError(caught instanceof Error ? caught.message : "无法加载认领状态")
    } finally {
      if (sequence === requestSequence.current) setLoading(false)
    }
  }, [token, conference.id])
  useEffect(() => { void refresh(); return () => { requestSequence.current++ } }, [refresh])
  const accessBySeat = new Map(access.map((item) => [item.seatId, item]))
  async function resetClaim() {
    if (!resetTarget?.user || !reason.trim() || resetting) return
    setResetting(true)
    setError("")
    try {
      await resetOrganizerSeatUser(token, conference.id, resetTarget.seatId, resetTarget.user.id, reason.trim())
      setResetTarget(undefined)
      setReason("")
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "重置失败，请刷新后重试")
    } finally { setResetting(false) }
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
    [COMMITTEE_FILTER_ALL]: "全部委员会",
    ...Object.fromEntries(
      conference.committees.map((committee, committeeIndex) => [
        committeeReference(committee, committeeIndex),
        committee.name.trim() || `委员会 ${committeeIndex + 1}`,
      ])
    ),
  }

  const normalizedQuery = query.trim().toLowerCase()
  const filteredRows =
    committeeFilter === COMMITTEE_FILTER_ALL && !normalizedQuery && claimFilter === "all"
      ? rows
      : rows.filter((row) => {
          const entry = loaded ? accessBySeat.get(row.seat.id ?? "") : undefined
          if (claimFilter === "claimed" && !entry?.user) return false
          if (claimFilter === "unclaimed" && (!entry || entry.user)) return false
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
    try { await navigator.clipboard.writeText(code) } catch { setError("复制失败，请手动选中 Key 复制"); return }
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
          席位总览
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          跨委员会查看席位和认领人，可搜索、复制邀请 Key 或导出邀请码。认领状态不代表在线状态。
        </p>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm">认领状态 <select aria-label="认领状态" className="rounded-md border bg-background p-2" value={claimFilter} onChange={(event) => setClaimFilter(event.target.value)} disabled={!loaded}>
          <option value="all">全部状态</option><option value="unclaimed">未认领</option><option value="claimed">已认领</option>
        </select></label>
        <Button variant="outline" size="sm" disabled={loading || resetting} onClick={() => void refresh()}>{loading ? "正在刷新…" : "刷新认领状态"}</Button>
        <span role="status" className="text-sm text-muted-foreground">{loaded ? `已认领 ${access.filter((item) => item.user).length} / ${access.length} 个席位` : "认领状态尚未获取"}</span>
      </div>
      <Dialog open={!!resetTarget} onOpenChange={(open) => { if (!open && !resetting) setResetTarget(undefined) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>重置席位认领</DialogTitle><DialogDescription>将解除“{resetTarget?.user?.displayName}”的认领并使其当前会话失效。原 Key 保留，代表可以重新认领；此操作会记录审计。</DialogDescription></DialogHeader>
          <label className="text-sm">重置原因<Input value={reason} maxLength={500} disabled={resetting} onChange={(event) => setReason(event.target.value)} placeholder="例如：代表忘记密码" /></label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button variant="destructive" disabled={resetting || !reason.trim()} onClick={() => void resetClaim()}>{resetting ? "正在重置…" : "确认重置认领"}</Button>
        </DialogContent>
      </Dialog>

      {hasUnsavedStructure ? (
        <p className="rounded-xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          大会结构有未保存的修改，此处展示的是已保存的大会数据。
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">
          尚未添加席位，请在「大会设置」的委员会中添加。
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-sm text-muted-foreground">
              共 {rows.length} 个席位 · {votingCount} 个有投票权 ·{" "}
              {withKeyCount} 个已生成邀请码
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={query}
                placeholder="搜索席位、代表、角色或委员会"
                aria-label="搜索席位"
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
                  aria-label="按委员会筛选"
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
                description="导出大会所有委员会中已生成的邀请码，包含委员会、席位名称、简称和角色。"
                missingCount={rows.length - exportRows.length}
              />
            </div>
          </div>

          {filteredRows.length === 0 ? (
            <div className="rounded-xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">
              没有符合条件的席位
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={clearFilters}
                >
                  清除筛选
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">委员会</th>
                    <th className="px-4 py-3 text-left font-medium">席位</th>
                    <th className="px-4 py-3 text-left font-medium">简称</th>
                    <th className="px-4 py-3 text-left font-medium">角色</th>
                    <th className="px-4 py-3 text-left font-medium">投票权</th>
                    <th className="px-4 py-3 text-left font-medium">认领人 / 排障</th>
                    <th className="px-4 py-3 text-left font-medium">
                      访问 Key
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
                              `委员会 ${row.committeeIndex + 1}`}
                          </Link>
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {row.seat.name || "未命名席位"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {row.seat.shortName || "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {role?.name || "未选择"}
                        </td>
                        <td className="px-4 py-3">
                          {row.seat.hasVotingRights ? "有" : "无"}
                        </td>
                        <td className="px-4 py-3">
                          {loaded && accessBySeat.has(row.seat.id ?? "") ? <div className="space-y-1">
                            <p>{accessBySeat.get(row.seat.id!)?.user?.displayName ?? "未认领"}</p>
                            {accessBySeat.get(row.seat.id!)?.user && conference.lifecycle !== "closed" && <Button variant="outline" size="sm" disabled={resetting} onClick={() => { setResetTarget(accessBySeat.get(row.seat.id!)); setReason(""); setError("") }}>重置认领</Button>}
                          </div> : <span className="text-muted-foreground">状态未知</span>}
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
                                title="复制 Key"
                                aria-label="复制 Key"
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
                              未生成
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
