"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import type { Conference } from "@/lib/conference-client"
import { conferenceReadiness } from "@/lib/conference-readiness"

export function ConferenceReadiness({ conference, hasUnsavedChanges, onNavigate }: {
  conference: Conference
  hasUnsavedChanges: boolean
  onNavigate: (tab: string) => void
}) {
  const checks = conferenceReadiness(conference)
  const remaining = checks.filter((check) => !check.ready).length
  return <section className="space-y-5" aria-labelledby="readiness-heading">
    <div>
      <h2 id="readiness-heading" className="text-xl font-semibold">开会前检查</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {conference.lifecycle === "closed" ? "大会已结束，以下为保留的配置检查。" : remaining ? `还有 ${remaining} 项配置需要检查。` : "基础配置已就绪，可前往大会设置确认激活状态。"}
        认领情况请查看席位总览；检查结果不代表代表已经到场。
      </p>
    </div>
    {hasUnsavedChanges && <p role="status" className="rounded-lg border p-3 text-sm">当前有未保存的修改，以下检查以已保存的数据为准。</p>}
    <ul className="divide-y rounded-xl border">
      {checks.map((check) => <li key={check.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div><p className="font-medium">{check.ready ? "✓ 已就绪" : "待检查"} · {check.label}</p><p className="mt-1 text-sm text-muted-foreground">{check.detail}</p></div>
        {check.committeeId ? <Link className="text-sm underline underline-offset-4" href={`/conferences/${conference.id}/committees/${check.committeeId}`}>查看委员会</Link> : <Button variant="outline" size="sm" onClick={() => onNavigate(check.target)}>前往{check.target === "seats" ? "席位总览" : "大会设置"}</Button>}
      </li>)}
    </ul>
  </section>
}
