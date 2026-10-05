"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  desktopAccount,
  readPlatformSession,
  signOutPlatform,
} from "./platform-session"
import { clearApiCache } from "./api-cache"

export function usePlatformAuth(requireLogin = true) {
  const router = useRouter()
  const [token, setToken] = useState<string>()
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    let revision = 0
    let previous: string | undefined
    const synchronize = async () => {
      const request = ++revision
      // Hide protected content until the latest account is known.
      setIsReady(false)
      try {
        const { token: current } = await readPlatformSession()
        if (cancelled || request !== revision) return
        if (previous !== current) clearApiCache()
        if (previous && current && previous !== current) {
          // Conference pages hold account-specific local state; reset it on account switches.
          window.location.reload()
          return
        }
        previous = current
        setToken(current)
        setError("")
        setIsReady(true)
        if (!current && requireLogin) router.replace("/login")
      } catch (caught) {
        if (cancelled || request !== revision) return
        setToken(undefined)
        setError(caught instanceof Error ? caught.message : "无法读取登录状态")
        setIsReady(true)
        if (requireLogin) router.replace("/login")
      }
    }
    const unsubscribe = desktopAccount()?.onChanged(() => {
      void synchronize()
    })
    void synchronize()
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [router, requireLogin])

  const signOut = useCallback(() => {
    void signOutPlatform(token)
      .then(async () => {
        const current = await readPlatformSession()
        setToken(current.token)
        if (!current.token) router.replace("/login")
      })
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : "退出失败")
      )
  }, [router, token])

  return { token, isReady, signOut, error }
}
