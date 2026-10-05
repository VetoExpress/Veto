"use client"

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
          setError("无法读取图片，请重新选择。")
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
        setError(caught instanceof Error ? caught.message : "操作失败，请重试")
    } finally {
      setBusy(false)
    }
  }
  function save(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setError("请填写用户名")
      return
    }
    if (name.trim() === user.name && !avatarData) {
      setNotice("没有需要保存的更改")
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
      setNotice("个人信息已更新")
    })
  }
  function reset(event: FormEvent) {
    event.preventDefault()
    if (password.length < 6 || password.length > 1024) {
      setError("密码应为 6–1024 个字符")
      return
    }
    if (password !== confirmation) {
      setError("两次输入的密码不一致")
      return
    }
    if (!/^\d{6}$/.test(code.trim())) {
      setError("请输入邮箱收到的 6 位验证码")
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
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border p-4 text-sm">
          {notice}
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
                  setError("请选择支持的图片文件。")
                  return
                }
                setCrop({ zoom: 1, x: 0, y: 0 })
                setSource(URL.createObjectURL(selected))
              }}
            />
            <Button
              variant="ghost"
              className="group relative size-20 rounded-full p-0"
              aria-label="更换头像"
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
                  已登录
                </Badge>
              </div>
              <p className="text-sm break-all text-muted-foreground">
                {user.email}
              </p>
              <p className="text-xs text-muted-foreground">
                点击头像更换图片，裁剪后自动压缩 · 最大 512 KB
              </p>
            </div>
          </div>
        </CardHeader>
      </Card>
      <form onSubmit={save}>
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>
              个人信息
            </CardTitle>
            <CardDescription>管理你的显示名称和账号资料。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="platform-name">用户名</Label>
              <Input
                id="platform-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={200}
                disabled={busy}
              />
              <p className="text-xs text-muted-foreground">
                用于展示你的身份，最多 200 个字符。
              </p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="platform-email">邮箱</Label>
                <Input id="platform-email" value={user.email} readOnly />
                <p className="text-xs text-muted-foreground">
                  注册邮箱，暂不支持修改。
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="platform-organization">所属模联</Label>
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
                ? `注册于 ${new Date(user.created_at).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })}`
                : "头像与用户名将在保存后更新。"}
            </p>
            <Button type="submit" disabled={busy}>
              保存修改
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
              安全设置
            </CardTitle>
            <CardDescription>通过注册邮箱的验证码重置密码。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="platform-code">邮箱验证码</Label>
              <div className="flex gap-2">
                <Input
                  id="platform-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="6 位验证码"
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
                      setNotice("验证码已发送到注册邮箱，5 分钟内有效")
                    })
                  }}
                >
                  {cooldown ? `${cooldown} 秒后重发` : "发送验证码"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                验证码将发送至 {user.email}，5 分钟内有效。
              </p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="platform-password">新密码</Label>
                <Input
                  id="platform-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="至少 6 位字符"
                  disabled={busy}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="platform-confirmation">确认新密码</Label>
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
              重置后，所有设备需使用新密码重新登录。
            </p>
            <Button
              variant="outline"
              type="submit"
              disabled={busy || !password || !confirmation}
            >
              重置密码
            </Button>
          </CardFooter>
        </Card>
      </form>
      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            登录状态
          </CardTitle>
          <CardDescription>管理当前账号的登录状态。</CardDescription>
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
                setNotice("账号信息已刷新")
              })
            }}
          >
            <RefreshCw />
            刷新账号信息
          </Button>
          <Button variant="destructive" disabled={busy} onClick={onSignOut}>
            <LogOut />
            退出登录
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
            <DialogTitle>裁剪头像</DialogTitle>
            <DialogDescription>
              拖动头像或调整位置和缩放，预览圆形头像。
            </DialogDescription>
          </DialogHeader>
          <canvas
            ref={canvas}
            width={256}
            height={256}
            className="mx-auto size-64 touch-none rounded-full bg-muted"
            aria-label="头像裁剪预览"
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
              ["zoom", "缩放", 1, 3],
              ["x", "水平位置", -1, 1],
              ["y", "垂直位置", -1, 1],
            ] as const
          ).map(([key, label, min, max]) => (
            <div key={key} className="flex flex-col gap-2">
              <Label htmlFor={`crop-${key}`}>{label}</Label>
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
              取消
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
              裁剪
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
