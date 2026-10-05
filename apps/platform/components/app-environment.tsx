"use client"

import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import { Minus, Square, X } from "lucide-react"

import { ThemeToggler } from "@/components/theme-toggler"

type WindowChannel = "window:minimize" | "window:maximize" | "window:close"
type DesktopWindow = Window & {
  electron?: { ipcRenderer?: { send?: (channel: WindowChannel) => void } }
}

const APP_ENTRY_KEY = "veto_platform_app_entry"
const AppEnvironmentContext = createContext({
  isAppEntry: false,
  isDesktop: false,
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

export function AppEnvironment({ children }: { children: ReactNode }) {
  const desktop = useSyncExternalStore(subscribe, isDesktop, serverSnapshot)
  const appEntry = useSyncExternalStore(subscribe, isAppEntry, serverSnapshot)

  function sendWindowCommand(channel: WindowChannel) {
    ;(window as DesktopWindow).electron?.ipcRenderer?.send?.(channel)
  }

  return (
    <AppEnvironmentContext.Provider
      value={{ isAppEntry: appEntry, isDesktop: desktop }}
    >
      <div className={desktop ? "platform-desktop" : undefined}>
        {desktop && (
          <div
            className="platform-titlebar sticky top-0 z-50 flex h-9 items-center border-b bg-background select-none"
            aria-label="窗口标题栏"
          >
            <span className="min-w-0 flex-1 truncate px-4 text-xs text-muted-foreground">
              云Veto
            </span>
            <div className="platform-window-actions flex h-full shrink-0 items-center">
              <ThemeToggler className="flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-muted [&_svg]:size-4" />
              <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
              <button
                type="button"
                className="flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-muted"
                aria-label="最小化"
                onClick={() => sendWindowCommand("window:minimize")}
              >
                <Minus className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-muted"
                aria-label="最大化 / 还原"
                onClick={() => sendWindowCommand("window:maximize")}
              >
                <Square className="size-3" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-red-500 hover:text-white"
                aria-label="关闭窗口"
                onClick={() => sendWindowCommand("window:close")}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
        {children}
      </div>
    </AppEnvironmentContext.Provider>
  )
}
