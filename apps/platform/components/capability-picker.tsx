"use client"
import { message } from "@/i18n/messages"
import { usePlatformTranslations } from "@/components/i18n-provider"

import { useMemo, useState } from "react"
import { ChevronDown, Search } from "lucide-react"

import {
  CAPABILITIES,
  CAPABILITY_GROUPS,
  CAPABILITY_LABELS,
  type Capability,
} from "@/lib/conference-client"
import { Badge } from "@/components/ui/badge"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface CapabilityPickerProps {
  value: Capability[]
  disabled?: boolean
  /** 用于生成 checkbox 的 id/htmlFor 前缀，可选 */
  idPrefix?: string
  /** 每组内权限网格的响应式列数，默认三列 */
  gridClassName?: string
  onChange: (capabilities: Capability[]) => void
}

export function CapabilityPicker({
  value,
  disabled = false,
  idPrefix,
  gridClassName = "sm:grid-cols-2 xl:grid-cols-3",
  onChange,
}: CapabilityPickerProps) {
  const { t, locale } = usePlatformTranslations()

  const [query, setQuery] = useState("")
  const [openGroupIds, setOpenGroupIds] = useState<ReadonlySet<string>>(
    () => new Set()
  )
  const keyword = query.trim().toLowerCase()
  const searching = keyword.length > 0

  const visibleGroups = useMemo(() => {
    if (!searching) return CAPABILITY_GROUPS
    return CAPABILITY_GROUPS.map((group) => ({
      ...group,
      capabilities: group.capabilities.filter(
        (capability) =>
          t(CAPABILITY_LABELS[capability]).toLowerCase().includes(keyword) ||
          capability.toLowerCase().includes(keyword)
      ),
    })).filter((group) => group.capabilities.length > 0)
  }, [keyword, searching, t])

  const toggleGroup = (groupId: string, open: boolean) => {
    setOpenGroupIds((previous) => {
      const next = new Set(previous)
      if (open) next.add(groupId)
      else next.delete(groupId)
      return next
    })
  }

  const toggleCapability = (capability: Capability) => {
    const next = value.includes(capability)
      ? value.filter((item) => item !== capability)
      : [...value, capability]
    // 保持与 CAPABILITIES 一致的稳定顺序
    const ordered = CAPABILITIES.filter((item) => next.includes(item))
    onChange(ordered as Capability[])
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          disabled={disabled}
          placeholder={t("platform_search_capabilities")}
          aria-label={t("platform_search_capabilities")}
          className="pl-9"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {visibleGroups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("platform_no_matching_capabilities")}
        </p>
      ) : (
        visibleGroups.map((group) => {
          const selectedCount = group.capabilities.filter((capability) =>
            value.includes(capability)
          ).length
          const open = searching || openGroupIds.has(group.id)
          return (
            <Collapsible
              key={group.id}
              open={open}
              onOpenChange={(nextOpen) => toggleGroup(group.id, nextOpen)}
            >
              <div className="rounded-lg border">
                <CollapsibleTrigger
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent/50"
                  aria-label={
                    open
                      ? t("platform_collapse_group_capabilities", {
                          value1: t(group.label),
                        })
                      : t("platform_expand_group_capabilities", {
                          value1: t(group.label),
                        })
                  }
                >
                  <span>{t(group.label)}</span>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline">
                      {selectedCount}/{group.capabilities.length}
                    </Badge>
                    <ChevronDown
                      aria-hidden
                      className={cn(
                        "transition-transform",
                        open && "rotate-180"
                      )}
                    />
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div
                    className={cn(
                      "grid gap-2 border-t px-3 py-3",
                      gridClassName
                    )}
                  >
                    {group.capabilities.map((capability) => (
                      <label
                        key={capability}
                        htmlFor={
                          idPrefix ? `${idPrefix}-${capability}` : undefined
                        }
                        className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent/50 has-checked:bg-accent/50"
                      >
                        <input
                          id={
                            idPrefix ? `${idPrefix}-${capability}` : undefined
                          }
                          type="checkbox"
                          checked={value.includes(capability)}
                          disabled={disabled}
                          onChange={() => toggleCapability(capability)}
                        />
                        <span className="min-w-0">
                          {t(CAPABILITY_LABELS[capability])}
                        </span>
                      </label>
                    ))}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          )
        })
      )}
    </div>
  )
}
