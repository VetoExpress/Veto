"use client"

import { useEffect, useState } from "react"

import {
  AuthError,
  fetchMe,
  readCachedUser,
  type PlatformUser,
} from "@/lib/auth-client"
import { desktopAccount, requireAccountResult } from "./platform-session"

export function usePlatformUser(
  token: string | undefined,
  onUnauthorized?: () => void
) {
  const [profile, setProfile] = useState<{
    token?: string
    user?: PlatformUser
  }>(() => ({
    token,
    user: token ? readCachedUser(token) : undefined,
  }))
  const [error, setError] = useState("")

  useEffect(() => {
    if (!token) return

    const api = desktopAccount()
    const cached = api ? undefined : readCachedUser(token)
    if (cached) {
      setProfile({ token, user: cached })
      return
    }

    let cancelled = false
    setError("")
    let revision = 0
    const load = () => {
      const requestRevision = ++revision
      const request = api
        ? api.getAccessToken().then((result) => {
            const current = requireAccountResult(result)
            return current.token === token
              ? (current.session.user ?? undefined)
              : undefined
          })
        : fetchMe(token)
      return request
        .then((result) => {
          if (!cancelled && revision === requestRevision)
            setProfile({ token, user: result })
        })
        .catch((caught: unknown) => {
          if (cancelled || revision !== requestRevision) return
          if (caught instanceof AuthError && caught.status === 401) {
            onUnauthorized?.()
            return
          }
          setError(
            caught instanceof Error ? caught.message : "加载用户信息失败"
          )
        })
    }
    const unsubscribe = api?.onChanged(() => {
      void load()
    })
    void load()
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [token, onUnauthorized])

  return { user: profile.token === token ? profile.user : undefined, error }
}
