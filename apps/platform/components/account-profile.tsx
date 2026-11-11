"use client"
import { message } from "@/i18n/messages"
import { usePlatformTranslations } from "@/components/i18n-provider"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { Camera, Check, LogOut, RefreshCw, ShieldCheck } from "lucide-react"
import {
  avatarCropRegion,
  cropAvatarUpload,
  type AvatarCrop,
} from "@vetoexpress/auth/avatar"
import {
  AuthError,
  type PlatformUser,
  updateAccountProfile,
  refreshAccountProfile,
  sendAccountPasswordCode,
  resetAccountPassword,
} from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { UserAvatar } from "@/components/user-avatar"

export function AccountProfile({
  user,
  token,
  onSignOut,
}: {
  user: PlatformUser
  token: string
  onSignOut: () => void
}) {
  const { t, locale } = usePlatformTranslations()

  const [name, setName] = useState(user.name)
  const [avatar, setAvatar] = useState(user.avatar)
  const [avatarData, setAvatarData] = useState<string>()
  const [source, setSource] = useState("")
  const [crop, setCrop] = useState<AvatarCrop>({ zoom: 1, x: 0, y: 0 })
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [deadline, setDeadline] = useState(0)
  const [cooldown, setCooldown] = useState(0)
  const file = useRef<HTMLInputElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ x: number; y: number; crop: AvatarCrop } | null>(null)

  useEffect(() => {
    setName(user.name)
  }, [user.name])
  useEffect(() => {
    setAvatar(user.avatar)
    setAvatarData(undefined)
  }, [user.avatar])
  useEffect(
    () => () => {
      if (source) URL.revokeObjectURL(source)
    },
    [source]
  )
  useEffect(() => {
    if (!deadline) return
    const tick = () =>
      setCooldown(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [deadline])
  useEffect(() => {
    if (!source) return
    let cancelled = false
    const image = new Image()
    image.src = source
    void image
      .decode()
      .then(() => {
        if (cancelled) return
        const context = canvas.current?.getContext("2d")
        if (!context) return
        const region = avatarCropRegion(
          image.naturalWidth,
          image.naturalHeight,
          crop
        )
        context.clearRect(0, 0, 256, 256)
        context.drawImage(
          image,
          region.x,
          region.y,
          region.size,
          region.size,
          0,
          0,
          256,
          256
        )
      })
      .catch(() => {
        if (!cancelled) {
          setError("platform_image_read_failed")
          setSource("")
        }
      })
    return () => {
      cancelled = true
    }
  }, [source, crop])

  async function run(operation: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError("")
    setNotice("")
    try {
      await operation()
    } catch (caught) {
      if (caught instanceof AuthError && caught.status === 401) onSignOut()
      else
        setError(
          caught instanceof Error
            ? caught.message
            : message("platform_operation_failed")
        )
    } finally {
      setBusy(false)
    }
  }
  function save(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setError("platform_enter_username")
      return
    }
    if (name.trim() === user.name && !avatarData) {
      setNotice("platform_no_changes")
      return
    }
    void run(async () => {
      const updated = await updateAccountProfile(token, {
        name: name.trim(),
        ...(avatarData ? { avatar: avatarData } : {}),
      })
      setName(updated.name)
      setAvatar(updated.avatar)
      setAvatarData(undefined)
      setNotice("platform_profile_updated")
    })
  }
  function reset(event: FormEvent) {
    event.preventDefault()
    if (password.length < 6 || password.length > 1024) {
      setError("platform_password_length")
      return
    }
    if (password !== confirmation) {
      setError("platform_password_mismatch")
      return
    }
    if (!/^\d{6}$/.test(code.trim())) {
      setError("platform_enter_email_code")
      return
    }
    void run(async () => {
      await resetAccountPassword(user.email, code.trim(), password)
      setCode("")
      setPassword("")
      setConfirmation("")
      onSignOut()
    })
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive"
        >
          {error.startsWith("platform_") ? t(error) : error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border p-4 text-sm">
          {notice.startsWith("platform_") ? t(notice) : notice}
        </p>
      )}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-4">
            <input
              ref={file}
              id="platform-avatar-upload"
              type="file"
              accept="image/*"
              hidden
              disabled={busy}
              onChange={(event) => {
                const selected = event.target.files?.[0]
                event.target.value = ""
                if (!selected) return
                if (!selected.type.startsWith("image/")) {
                  setError("platform_supported_image_required")
                  return
                }
                setCrop({ zoom: 1, x: 0, y: 0 })
                setSource(URL.createObjectURL(selected))
              }}
            />
            <Button
              variant="ghost"
              className="group relative size-20 rounded-full p-0"
              aria-label={t("platform_change_avatar")}
              disabled={busy}
              onClick={() => file.current?.click()}
            >
              <UserAvatar
                name={user.name}
                avatar={avatar || undefined}
                className="size-20 text-2xl"
              />
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <Camera />
              </span>
            </Button>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold break-all">{user.name}</h2>
                <Badge variant="secondary">
                  <Check />
                  {t("platform_logged_in")}
                </Badge>
              </div>
              <p className="text-sm break-all text-muted-foreground">
                {user.email}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("platform_avatar_hint")}
              </p>
            </div>
          </div>
        </CardHeader>
      </Card>
      <form onSubmit={save}>
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>
              {t("platform_personal_information")}
            </CardTitle>
            <CardDescription>{t("platform_profile_intro")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="platform-name">{t("platform_username")}</Label>
              <Input
                id="platform-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={200}
                disabled={busy}
              />
              <p className="text-xs text-muted-foreground">
                {t("platform_username_hint")}
              </p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="platform-email">{t("platform_email")}</Label>
                <Input id="platform-email" value={user.email} readOnly />
                <p className="text-xs text-muted-foreground">
                  {t("platform_email_readonly")}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="platform-organization">
                  {t("platform_organization")}
                </Label>
                <Input
                  id="platform-organization"
                  value={user.organization}
                  readOnly
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex-wrap justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {user.created_at
                ? t("platform_registered_at", {
                    value1: new Date(user.created_at).toLocaleDateString(
                      locale,
                      { year: "numeric", month: "long", day: "numeric" }
                    ),
                  })
                : t("platform_profile_save_hint")}
            </p>
            <Button type="submit" disabled={busy}>
              {t("platform_save_changes")}
            </Button>
          </CardFooter>
        </Card>
      </form>
      <form onSubmit={reset}>
        <Card>
          <CardHeader>
            <CardTitle
              role="heading"
              aria-level={2}
              className="flex items-center gap-2"
            >
              <ShieldCheck />
              {t("platform_security_settings")}
            </CardTitle>
            <CardDescription>{t("platform_security_intro")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="platform-code">{t("platform_email_code")}</Label>
              <div className="flex gap-2">
                <Input
                  id="platform-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder={t("platform_six_digit_code")}
                  disabled={busy}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || cooldown > 0}
                  onClick={() => {
                    void run(async () => {
                      await sendAccountPasswordCode(user.email)
                      setDeadline(Date.now() + 60000)
                      setNotice("platform_password_code_sent")
                    })
                  }}
                >
                  {cooldown
                    ? t("platform_resend_seconds", { value1: cooldown })
                    : t("platform_send_code")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("platform_code_will_send_to")}
                {user.email}
                {t("platform_code_expiry_suffix")}
              </p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="platform-password">
                  {t("platform_new_password")}
                </Label>
                <Input
                  id="platform-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={t("platform_password_min_characters")}
                  disabled={busy}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="platform-confirmation">
                  {t("platform_confirm_new_password")}
                </Label>
                <Input
                  id="platform-confirmation"
                  type="password"
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  disabled={busy}
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex-wrap justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {t("platform_password_reset_sessions_hint")}
            </p>
            <Button
              variant="outline"
              type="submit"
              disabled={busy || !password || !confirmation}
            >
              {t("platform_reset_password")}
            </Button>
          </CardFooter>
        </Card>
      </form>
      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            {t("platform_login_status")}
          </CardTitle>
          <CardDescription>{t("platform_session_intro")}</CardDescription>
        </CardHeader>
        <CardFooter className="flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              void run(async () => {
                const updated = await refreshAccountProfile(token)
                setName(updated.name)
                setAvatar(updated.avatar)
                setAvatarData(undefined)
                setNotice("platform_account_refreshed")
              })
            }}
          >
            <RefreshCw />
            {t("platform_refresh_account")}
          </Button>
          <Button variant="destructive" disabled={busy} onClick={onSignOut}>
            <LogOut />
            {t("platform_logout")}
          </Button>
        </CardFooter>
      </Card>
      <Dialog
        open={!!source}
        onOpenChange={(open) => {
          if (!open && !busy) setSource("")
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("platform_crop_avatar")}</DialogTitle>
            <DialogDescription>
              {t("platform_crop_avatar_hint")}
            </DialogDescription>
          </DialogHeader>
          <canvas
            ref={canvas}
            width={256}
            height={256}
            className="mx-auto size-64 touch-none rounded-full bg-muted"
            aria-label={t("platform_avatar_crop_preview")}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId)
              drag.current = { x: event.clientX, y: event.clientY, crop }
            }}
            onPointerMove={(event) => {
              const start = drag.current
              if (start && !busy)
                setCrop({
                  ...start.crop,
                  x: Math.max(
                    -1,
                    Math.min(1, start.crop.x - (event.clientX - start.x) / 128)
                  ),
                  y: Math.max(
                    -1,
                    Math.min(1, start.crop.y - (event.clientY - start.y) / 128)
                  ),
                })
            }}
            onPointerUp={() => {
              drag.current = null
            }}
            onPointerCancel={() => {
              drag.current = null
            }}
          />
          {(
            [
              ["zoom", t("platform_zoom"), 1, 3],
              ["x", t("platform_horizontal_position"), -1, 1],
              ["y", t("platform_vertical_position"), -1, 1],
            ] as const
          ).map(([key, label, min, max]) => (
            <div key={key} className="flex flex-col gap-2">
              <Label htmlFor={`crop-${key}`}>{t(label)}</Label>
              <input
                id={`crop-${key}`}
                type="range"
                min={min}
                max={max}
                step={0.01}
                value={crop[key]}
                disabled={busy}
                onChange={(event) =>
                  setCrop({ ...crop, [key]: Number(event.target.value) })
                }
              />
            </div>
          ))}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setSource("")}
            >
              {t("platform_cancel")}
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                void run(async () => {
                  const upload = await cropAvatarUpload(source, crop)
                  setAvatar(upload.dataUrl)
                  setAvatarData(upload.base64)
                  setSource("")
                })
              }}
            >
              {t("platform_crop")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
