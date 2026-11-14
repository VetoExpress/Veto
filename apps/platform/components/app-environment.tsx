"use client"
import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react"

import { cn } from "@/lib/utils"

type WindowChannel = "window:return-to-app"
type DesktopWindow = Window & {
  electron?: { ipcRenderer?: { send?: (channel: WindowChannel) => void } }
}

const APP_ENTRY_KEY = "veto_platform_app_entry"
const AppEnvironmentContext = createContext<{
  isAppEntry: boolean
  isDesktop: boolean
  isEmbedded: boolean
}>({
  isAppEntry: false,
  isDesktop: false,
  isEmbedded: false,
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

function isEmbedded() {
  if (new URLSearchParams(window.location.search).get("embedded") === "1") {
    try {
      sessionStorage.setItem("veto_platform_embedded", "1")
    } catch {
      // The query parameter is enough for the first render.
    }
    return true
  }
  try {
    return sessionStorage.getItem("veto_platform_embedded") === "1"
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
  if (new URLSearchParams(window.location.search).get("embedded") === "1") {
    try {
      sessionStorage.setItem("veto_platform_embedded", "1")
    } catch {
      // The query parameter remains available for the current page.
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
  const embedded = useSyncExternalStore(subscribe, isEmbedded, serverSnapshot)

  return (
    <AppEnvironmentContext.Provider
      value={{
        isAppEntry: appEntry,
        isDesktop: desktop,
        isEmbedded: embedded,
      }}
    >
      <div
        className={cn(
          desktop && "flex flex-col overflow-hidden bg-background",
          desktop &&
            (embedded
              ? "platform-embedded h-svh"
              : "platform-desktop m-2 h-[calc(100svh-1rem)] rounded-xl shadow-sm")
        )}
      >
        <div
          className={
            desktop
              ? "platform-desktop-content min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
              : undefined
          }
        >
          {children}
        </div>
      </div>
    </AppEnvironmentContext.Provider>
  )
}
