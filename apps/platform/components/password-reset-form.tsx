"use client"

import { useEffect, useState, type FormEvent } from "react"
import { ArrowLeft, KeyRound, Loader2, Mail } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { forgotPassword, resetPassword } from "@/lib/auth-client"

const RESEND_COOLDOWN_SECONDS = 60

export function PasswordResetForm({
  onCancel,
  onSuccess,
}: {
  onCancel: () => void
  onSuccess: (email: string) => void
}) {
  const [stage, setStage] = useState<"email" | "reset">("email")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [cooldown, setCooldown] = useState(0)
  const coolingDown = cooldown > 0

  useEffect(() => {
    if (!coolingDown) return
    const timer = setInterval(() => {
      setCooldown((seconds) => Math.max(seconds - 1, 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [coolingDown])

  async function sendCode() {
    if (busy || coolingDown || !email.trim()) return
    setBusy(true)
    setError("")
    setNotice("")
    try {
      const address = email.trim().toLowerCase()
      await forgotPassword(address)
      setEmail(address)
      setCode("")
      setStage("reset")
      setCooldown(RESEND_COOLDOWN_SECONDS)
      setNotice(
        "若该邮箱已注册且设置了密码，你将收到验证码。验证码 5 分钟内有效；重发后请使用最新验证码。"
      )
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "发送失败")
    } finally {
      setBusy(false)
    }
  }

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await sendCode()
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !/^\d{6}$/.test(code) || password.length < 6) return
    if (password !== confirmation) {
      setError("两次输入的密码不一致")
      return
    }
    setBusy(true)
    setError("")
    try {
      await resetPassword(email, code, password)
      onSuccess(email)
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "重设密码失败")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {stage === "email" ? (
        <form className="flex flex-col gap-4" onSubmit={submitEmail}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reset-email">注册邮箱</Label>
            <Input
              id="reset-email"
              type="email"
              className="h-12"
              placeholder="name@example.com"
              autoComplete="email"
              required
              maxLength={254}
              disabled={busy}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <Button
            type="submit"
            size="lg"
            disabled={busy || coolingDown || !email.trim()}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Mail className="size-4" />
            )}
            {coolingDown ? `重新发送（${cooldown}s）` : "发送验证码"}
          </Button>
        </form>
      ) : (
        <>
          <div className="flex flex-col gap-2 text-sm">
            <p className="font-medium break-all">{email}</p>
            {notice ? (
              <p role="status" className="text-muted-foreground">
                {notice}
              </p>
            ) : null}
          </div>
          <form className="flex flex-col gap-4" onSubmit={submitPassword}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="reset-code">验证码</Label>
              <Input
                id="reset-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="h-12 font-mono tracking-widest"
                placeholder="6 位数字验证码"
                required
                pattern="[0-9]{6}"
                maxLength={6}
                disabled={busy}
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
              <Button
                type="button"
                variant="link"
                size="sm"
                className="self-end"
                disabled={busy || coolingDown}
                onClick={sendCode}
              >
                {coolingDown ? `重新发送（${cooldown}s）` : "重新发送验证码"}
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="reset-password">新密码</Label>
              <Input
                id="reset-password"
                type="password"
                className="h-12"
                placeholder="至少 6 位"
                autoComplete="new-password"
                required
                minLength={6}
                disabled={busy}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="reset-confirmation">确认新密码</Label>
              <Input
                id="reset-confirmation"
                type="password"
                className="h-12"
                placeholder="再次输入新密码"
                autoComplete="new-password"
                required
                minLength={6}
                disabled={busy}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </div>
            <Button
              type="submit"
              size="lg"
              disabled={
                busy ||
                !/^\d{6}$/.test(code) ||
                password.length < 6 ||
                confirmation.length < 6
              }
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <KeyRound className="size-4" />
              )}
              重设密码
            </Button>
          </form>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              setStage("email")
              setCode("")
              setPassword("")
              setConfirmation("")
              setError("")
              setNotice("")
            }}
          >
            修改邮箱
          </Button>
        </>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={onCancel}
      >
        <ArrowLeft className="size-4" />
        返回登录
      </Button>
    </div>
  )
}
