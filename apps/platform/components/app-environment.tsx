"use client"

import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import { ArrowLeft, ArrowRight, Minus, Monitor, Square, X } from "lucide-react"

import { ThemeToggler } from "@/components/theme-toggler"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type WindowChannel =
  | "window:minimize"
  | "window:maximize"
  | "window:close"
  | "window:return-to-app"
type DesktopWindow = Window & {
  electron?: { ipcRenderer?: { send?: (channel: WindowChannel) => void } }
}

const APP_ENTRY_KEY = "veto_platform_app_entry"
const AppEnvironmentContext = createContext<{
  isAppEntry: boolean
  isDesktop: boolean
  titlebarContent: HTMLDivElement | null
  titlebarActions: HTMLDivElement | null
}>({
  isAppEntry: false,
  isDesktop: false,
  titlebarContent: null,
  titlebarActions: null,
})

function isDesktop() {
  return (
    typeof (window as DesktopWindow).electron?.ipcRenderer?.send === "function"
  )
}

function isAppEntry() {
  if (
    isDesktop() ||
    new URLSearchParams(window.location.search).get("from") === "app"
  ) {
    return true
  }
  try {
    return sessionStorage.getItem(APP_ENTRY_KEY) === "1"
  } catch {
    return false
  }
}

function subscribe() {
  // Keep the entry mode through login redirects and reloads, within this tab only.
  if (isAppEntry()) {
    try {
      sessionStorage.setItem(APP_ENTRY_KEY, "1")
    } catch {
      // Native detection still works when browser storage is unavailable.
    }
  }
  return () => {}
}

const serverSnapshot = () => false

export function useAppEnvironment() {
  return useContext(AppEnvironmentContext)
}

export function returnToApp() {
  if (isDesktop()) {
    ;(window as DesktopWindow).electron?.ipcRenderer?.send?.(
      "window:return-to-app"
    )
  } else {
    window.location.assign("https://app.miaoyww.top")
  }
}

export function AppEnvironment({ children }: { children: ReactNode }) {
  const desktop = useSyncExternalStore(subscribe, isDesktop, serverSnapshot)
  const appEntry = useSyncExternalStore(subscribe, isAppEntry, serverSnapshot)
  const [titlebarContent, setTitlebarContent] = useState<HTMLDivElement | null>(
    null
  )
  const [titlebarActions, setTitlebarActions] = useState<HTMLDivElement | null>(
    null
  )

  function sendWindowCommand(channel: WindowChannel) {
    ;(window as DesktopWindow).electron?.ipcRenderer?.send?.(channel)
  }

  return (
    <AppEnvironmentContext.Provider
      value={{
        isAppEntry: appEntry,
        isDesktop: desktop,
        titlebarContent,
        titlebarActions,
      }}
    >
      <div
        className={
          desktop
            ? "platform-desktop m-2 overflow-clip rounded-xl bg-background shadow-sm"
            : undefined
        }
      >
        {desktop && (
          <header
            className="platform-titlebar sticky top-0 z-50 flex h-9 items-center gap-2 bg-background select-none"
            aria-label="窗口标题栏"
          >
            <div
              ref={setTitlebarContent}
              className="ml-[10px] flex h-full max-w-[40%] min-w-0 items-center"
            />
            <nav
              className="flex h-full shrink-0 items-center gap-1"
              aria-label="应用导航"
            >
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                className="text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="后退"
                title="后退"
                onClick={() => window.history.back()}
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                className="text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="前进"
                title="前进"
                onClick={() => window.history.forward()}
              >
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-full gap-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={returnToApp}
                title="返回应用"
              >
                <Monitor className="size-4" aria-hidden="true" />
                返回应用
              </Button>
              <span className="mx-1 h-5 w-px bg-border/40" aria-hidden="true" />
            </nav>
            <div
              ref={setTitlebarActions}
              className="ml-auto flex h-full shrink-0 items-center"
            />
            <div className="platform-window-actions flex h-full shrink-0 items-center">
              <ThemeToggler
                className={cn(
                  buttonVariants({ variant: "ghost" }),
                  "flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:size-4"
                )}
              />
              <span
                className="mx-0.5 h-5 w-px bg-border/40"
                aria-hidden="true"
              />
              <Button
                type="button"
                variant="ghost"
                className="flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="最小化"
                onClick={() => sendWindowCommand("window:minimize")}
              >
                <Minus className="size-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="最大化 / 还原"
                onClick={() => sendWindowCommand("window:maximize")}
              >
                <Square className="size-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-red-500 hover:text-white"
                aria-label="关闭窗口"
                onClick={() => sendWindowCommand("window:close")}
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </header>
        )}
        {children}
      </div>
    </AppEnvironmentContext.Provider>
  )
}
