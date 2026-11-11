"use client"

import { message } from "@/i18n/messages"
import { usePlatformTranslations } from "@/components/i18n-provider"
import type { JSX } from "react"
import type { LucideIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"

interface ConferenceWorkspacePlaceholderProps {
  icon: LucideIcon
  title: string
  description: string
  items: string[]
}

export function ConferenceWorkspacePlaceholder({
  icon: Icon,
  title,
  description,
  items,
}: ConferenceWorkspacePlaceholderProps): JSX.Element {
  const { t, locale } = usePlatformTranslations()

  return (
    <section
      aria-labelledby={`workspace-${title}`}
      className="grid min-h-96 place-items-center rounded-xl border bg-muted/20 px-5 py-12 sm:px-8"
    >
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-lg border bg-background text-muted-foreground">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <Badge variant="outline">{t("platform_coming_soon")}</Badge>
            <h2
              id={`workspace-${title}`}
              className="mt-2 text-xl font-semibold tracking-tight"
            >
              {title}
            </h2>
          </div>
        </div>

        <p className="mt-5 max-w-md text-sm leading-6 text-muted-foreground">
          {description}
        </p>

        <ul className="mt-6 flex flex-wrap gap-2">
          {items.map((item) => (
            <li key={item}>
              <Badge variant="secondary">{item}</Badge>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
