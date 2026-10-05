"use client"

import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { ArrowLeft, Loader2, LogOut } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { ThemeToggler } from "@/components/theme-toggler"
import { useAppEnvironment } from "@/components/app-environment"
import { Button, buttonVariants } from "@/components/ui/button"
import { UserAvatar } from "@/components/user-avatar"
import { ConferenceApiError, getConference } from "@/lib/conference-client"
import { committeeReference } from "@/lib/conference-structure"
import { usePlatformAuth } from "@/lib/use-platform-auth"
import { usePlatformUser } from "@/lib/use-platform-user"
import { cn } from "@/lib/utils"

const CONFERENCE_ROUTE = /^\/conferences\/([^/]+)(?:\/committees\/([^/]+))?$/

function usePlatformSubtitle(token: string | undefined, signOut: () => void) {
  const pathname = usePathname()
  const routeMatch = CONFERENCE_ROUTE.exec(pathname ?? "")
  const conferenceId = routeMatch?.[1]
  const committeeId = routeMatch?.[2]

  const [subtitle, setSubtitle] = useState("Platform")

  useEffect(() => {
    if (!token || !conferenceId || conferenceId === "new") {
      setSubtitle("Platform")
      return
    }

    let cancelled = false
    getConference(token, conferenceId)
      .then((conference) => {
        if (cancelled) return
        if (committeeId && committeeId !== "new") {
          const committee = conference.committees.find(
            (item, index) => committeeReference(item, index) === committeeId
          )
          setSubtitle(
            committee
              ? `${conference.name} - ${committee.name}`
              : conference.name
          )
        } else {
          setSubtitle(conference.name)
        }
      })
      .catch((caught: unknown) => {
        if (cancelled) return
        if (caught instanceof ConferenceApiError && caught.status === 401) {
          signOut()
          return
        }
        setSubtitle("Platform")
      })

    return () => {
      cancelled = true
    }
  }, [committeeId, conferenceId, signOut, token])

  return subtitle
}

export function PlatformLoading({ label = "正在进入 Platform" }) {
  return (
    <main className="grid min-h-svh place-items-center bg-background">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="animate-spin" aria-hidden="true" />
        {label}
      </div>
    </main>
  )
}

export function PlatformShell({
  children,
  backHref,
  backLabel = "返回大会列表",
}: {
  children: ReactNode
  backHref?: string
  backLabel?: string
}) {
  const pathname = usePathname()
  const { token, signOut } = usePlatformAuth()
  const { user } = usePlatformUser(token, signOut)
  const subtitle = usePlatformSubtitle(token, signOut)
  const onAccountPage = pathname === "/account"
  const { isAppEntry, isDesktop } = useAppEnvironment()
  return (
    <div className="platform-shell relative flex min-h-svh flex-col overflow-clip bg-background">
      <header className="relative z-10 flex h-20 shrink-0 items-center justify-between border-b bg-background/85 px-4 backdrop-blur-md sm:px-8 lg:px-12">
        <div className="flex min-w-0 items-center gap-3">
          {backHref ? (
            <Link
              href={backHref}
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon-lg" }),
                "size-11 shrink-0 rounded-full"
              )}
              aria-label={backLabel}
            >
              <ArrowLeft aria-hidden="true" />
            </Link>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/favicon.png" alt="" className="size-9 shrink-0" />
          )}
          <div className="min-w-0 leading-tight">
            <p className="truncate font-semibold tracking-tight">云Veto</p>
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/account"
            className={cn(
              buttonVariants({
                variant: onAccountPage ? "secondary" : "ghost",
                size: "lg",
              }),
              "h-11 max-w-40 rounded-full pl-1.5",
              onAccountPage ? "shadow-sm" : "hover:bg-muted"
            )}
            aria-label={user?.name ? `用户 ${user.name}` : "用户中心"}
          >
            <UserAvatar
              name={user?.name ?? "?"}
              avatar={user?.avatar || undefined}
              className="size-8 bg-muted text-foreground"
            />
            <span className="truncate font-medium">{user?.name || "用户"}</span>
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            className="size-11 rounded-full"
            onClick={signOut}
            aria-label="退出登录"
          >
            <LogOut aria-hidden="true" />
          </Button>
          {!isDesktop && (
            <ThemeToggler className="flex size-11 cursor-pointer items-center justify-center rounded-full bg-background transition-colors hover:bg-muted [&_svg]:size-4" />
          )}
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-8 sm:py-16 lg:px-12 lg:py-20">
        {children}
      </main>

      {!isAppEntry && (
        <footer className="relative z-10 flex flex-col items-start justify-between gap-4 border-t bg-muted/50 px-[clamp(1.25rem,4vw,4rem)] py-8 text-[0.625rem] tracking-[0.15em] text-muted-foreground sm:flex-row sm:items-center">
          <span>© VETO / 2026</span>
          <span>QUIET TOOLS FOR LOUD MOMENTS</span>
          <span className="flex items-center gap-[1.375rem]">
            <a
              href="https://github.com/Miaoyww/Veto"
              target="_blank"
              rel="noreferrer"
              className="whitespace-nowrap text-foreground transition-colors hover:text-muted-foreground"
            >
              GITHUB
            </a>
            <a
              href="https://veto.miaoyww.top/#contact"
              className="whitespace-nowrap text-foreground transition-colors hover:text-muted-foreground"
            >
              CONTACT
            </a>
          </span>
        </footer>
      )}
    </div>
  )
}
