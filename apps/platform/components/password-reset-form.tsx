"use client"
import { message } from "@/i18n/messages"
import { usePlatformTranslations } from "@/components/i18n-provider"

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
  const { t, locale } = usePlatformTranslations()

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
      setNotice("platform_recovery_code_notice")
    } catch (exception) {
      setError(
        exception instanceof Error
          ? exception.message
          : message("platform_send_failed")
      )
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
      setError("platform_password_mismatch")
      return
    }
    setBusy(true)
    setError("")
    try {
      await resetPassword(email, code, password)
      onSuccess(email)
    } catch (exception) {
      setError(
        exception instanceof Error
          ? exception.message
          : message("platform_reset_password_failed")
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {stage === "email" ? (
        <form className="flex flex-col gap-4" onSubmit={submitEmail}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reset-email">
              {t("platform_registered_email")}
            </Label>
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
            {coolingDown
              ? t("platform_resend_countdown", { value1: cooldown })
              : t("platform_send_code")}
          </Button>
        </form>
      ) : (
        <>
          <div className="flex flex-col gap-2 text-sm">
            <p className="font-medium break-all">{email}</p>
            {notice ? (
              <p role="status" className="text-muted-foreground">
                {notice.startsWith("platform_") ? t(notice) : notice}
              </p>
            ) : null}
          </div>
          <form className="flex flex-col gap-4" onSubmit={submitPassword}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="reset-code">
                {t("platform_verification_code")}
              </Label>
              <Input
                id="reset-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="h-12 font-mono tracking-widest"
                placeholder={t("platform_six_digit_numeric_code")}
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
                {coolingDown
                  ? t("platform_resend_countdown", { value1: cooldown })
                  : t("platform_resend_code")}
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="reset-password">
                {t("platform_new_password")}
              </Label>
              <Input
                id="reset-password"
                type="password"
                className="h-12"
                placeholder={t("platform_password_minimum")}
                autoComplete="new-password"
                required
                minLength={6}
                disabled={busy}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="reset-confirmation">
                {t("platform_confirm_new_password")}
              </Label>
              <Input
                id="reset-confirmation"
                type="password"
                className="h-12"
                placeholder={t("platform_repeat_password")}
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
              {t("platform_set_password")}
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
            {t("platform_change_email")}
          </Button>
        </>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error.startsWith("platform_") ? t(error) : error}
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
        {t("platform_back_login")}
      </Button>
    </div>
  )
}
