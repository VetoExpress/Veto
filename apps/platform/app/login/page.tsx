"use client"
import { message } from "@/i18n/messages"
import {
  LanguageSwitcher,
  usePlatformTranslations,
} from "@/components/i18n-provider"

import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import { ArrowLeft, Loader2, LogIn, Monitor, UserPlus } from "lucide-react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TypingAnimation } from "@/components/ui/typing-animation"
import { TextAnimate } from "@/components/ui/text-animate"
import {
  login,
  register,
  sendVerificationCode,
  verifyCode,
} from "@/lib/auth-client"
import { ThemeToggler } from "@/components/theme-toggler"
import { returnToApp, useAppEnvironment } from "@/components/app-environment"
import { BubbleBackground } from "@/components/animate-ui/components/backgrounds/bubble"
import { PasswordResetForm } from "@/components/password-reset-form"
import { usePlatformAuth } from "@/lib/use-platform-auth"
import { saveWebToken } from "@/lib/platform-session"

type AuthTab = "login" | "register"
type RegisterStage = "email" | "code" | "password"

const RESEND_COOLDOWN_SECONDS = 60

export default function Page() {
  const { t, locale } = usePlatformTranslations()

  const { isDesktop } = useAppEnvironment()
  const [tab, setTab] = useState<AuthTab>("login")
  const [resettingPassword, setResettingPassword] = useState(false)
  const [resetEmail, setResetEmail] = useState("")
  const router = useRouter()
  const { token, isReady, error: sessionError } = usePlatformAuth(false)

  useEffect(() => {
    if (isReady && token) {
      router.replace("/")
    }
  }, [router, token, isReady])

  return (
    <div className="relative min-h-svh overflow-clip">
      {sessionError && (
        <p role="alert" className="relative z-30 p-4 text-destructive">
          {sessionError.startsWith("platform_")
            ? t(sessionError)
            : sessionError}
        </p>
      )}
      <a
        href="https://veto.miaoyww.top"
        className="absolute top-6 left-8 z-20 flex items-center gap-3 py-2 pr-4 pl-2"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/favicon.png" alt="Veto" className="size-8" />
        <span className="text-lg font-medium">Veto</span>
      </a>

      <div className="absolute top-6 right-6 z-20 flex items-center gap-2">
        <LanguageSwitcher />
        {!isDesktop && (
          <ThemeToggler className="flex size-10 cursor-pointer items-center justify-center rounded-full border bg-card/80 shadow-sm backdrop-blur [&_svg]:size-5" />
        )}
      </div>

      <BubbleBackground
        interactive
        className="absolute inset-0"
        aria-hidden="true"
      />

      <div className="relative z-10 flex min-h-svh items-center justify-center">
        <div className="flex w-full max-w-7xl items-center">
          <HeroSection />

          <section className="flex w-full items-center justify-center px-6 py-12 lg:w-[560px]">
            <Card className="w-full max-w-md rounded-2xl bg-card/90 p-0 shadow-2xl ring-0 backdrop-blur-xl">
              <CardHeader className="p-6 pb-4">
                <CardTitle className="text-2xl font-bold">
                  {resettingPassword
                    ? t("platform_recover_password")
                    : t("platform_veto_platform")}
                </CardTitle>
                <CardDescription className="text-sm">
                  {resettingPassword
                    ? t("platform_recover_password_intro")
                    : t("platform_login_intro")}
                </CardDescription>
              </CardHeader>

              <CardContent className="px-6 pb-5">
                {resettingPassword ? (
                  <PasswordResetForm
                    onCancel={() => setResettingPassword(false)}
                    onSuccess={(email) => {
                      setResetEmail(email)
                      setTab("login")
                      setResettingPassword(false)
                    }}
                  />
                ) : (
                  <Tabs
                    value={tab}
                    onValueChange={(value) => setTab(value as AuthTab)}
                    className="gap-4"
                  >
                    <TabsList className="w-full">
                      <TabsTrigger value="login">
                        {t("platform_login")}
                      </TabsTrigger>
                      <TabsTrigger value="register">
                        {t("platform_register")}
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="login">
                      <LoginForm
                        initialEmail={resetEmail}
                        onForgotPassword={() => {
                          setResetEmail("")
                          setResettingPassword(true)
                        }}
                      />
                    </TabsContent>
                    <TabsContent value="register">
                      <RegisterForm onSuccess={() => setTab("login")} />
                    </TabsContent>
                  </Tabs>
                )}
              </CardContent>

              <CardFooter className="flex-col gap-3 border-t bg-transparent p-6">
                <div className="flex w-full gap-3">
                  <Button
                    variant="outline"
                    type="button"
                    className="h-12 flex-1 justify-center gap-2 rounded-lg shadow-sm"
                    onClick={returnToApp}
                  >
                    <Monitor className="size-5" />
                    {t("platform_return_app")}
                  </Button>

                  <SocialLoginButton
                    image="/wechat.png"
                    label={t("platform_wechat_login")}
                  />
                  <SocialLoginButton
                    image="/feishu.png"
                    label={t("platform_feishu_login")}
                  />
                </div>
              </CardFooter>
            </Card>
          </section>
        </div>
      </div>
    </div>
  )
}

function HeroSection() {
  const { t, locale } = usePlatformTranslations()

  return (
    <section className="hidden flex-1 flex-col justify-center px-12 lg:flex xl:px-24">
      <div className="flex max-w-xl flex-col gap-4">
        <h1 className="text-5xl font-bold tracking-tight text-foreground">
          Build your ideas.
          <br />
          Better than ever.
        </h1>

        <span className="max-w-md text-base text-muted-foreground">
          {t("platform_hero_intro")}
        </span>

        <div className="mt-10 flex gap-6 text-sm text-muted-foreground">
          <HeroStat
            label={t("platform_event_management")}
            title={t("platform_one_stop")}
          />
          <HeroStat
            label={t("platform_situation_sync")}
            title={t("platform_real_time")}
          />
          <HeroStat
            label={t("platform_digital_management")}
            title={t("platform_whole_process")}
          />
        </div>
      </div>
    </section>
  )
}

function HeroStat({ label, title }: { label: string; title: string }) {
  return (
    <div>
      <div className="text-2xl font-bold text-foreground">{title}</div>
      <div>{label}</div>
    </div>
  )
}

function LoginForm({
  initialEmail,
  onForgotPassword,
}: {
  initialEmail: string
  onForgotPassword: () => void
}) {
  const { t, locale } = usePlatformTranslations()

  const router = useRouter()
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email.trim() || !password) return

    setBusy(true)
    setError("")
    try {
      const token = await login(email.trim(), password)
      saveWebToken(token)
      router.replace("/")
    } catch (exception) {
      setError(
        exception instanceof Error
          ? exception.message
          : message("platform_login_failed")
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      {initialEmail ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("platform_password_reset_success")}
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="login-email">{t("platform_email")}</Label>
        <Input
          id="login-email"
          type="email"
          className="h-12"
          placeholder="name@example.com"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="login-password">{t("platform_password")}</Label>
          <Button
            type="button"
            variant="link"
            size="sm"
            disabled={busy}
            onClick={onForgotPassword}
          >
            {t("platform_forgot_password")}
          </Button>
        </div>
        <Input
          id="login-password"
          type="password"
          className="h-12"
          placeholder={t("platform_password")}
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      <SubmitButton
        icon={<LogIn className="size-4" />}
        busyIcon={<Loader2 className="size-4 animate-spin" />}
        busy={busy}
        disabled={busy || !email.trim() || !password.trim()}
        label={t("platform_login")}
      />
      {error ? (
        <p className="text-sm text-destructive">
          {error.startsWith("platform_") ? t(error) : error}
        </p>
      ) : null}
    </form>
  )
}

function RegisterForm({ onSuccess }: { onSuccess: () => void }) {
  const { t, locale } = usePlatformTranslations()

  const [stage, setStage] = useState<RegisterStage>("email")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [organization, setOrganization] = useState("")
  const [password, setPassword] = useState("")
  const [regToken, setRegToken] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return

    const timer = setInterval(() => {
      setCooldown((seconds) => Math.max(seconds - 1, 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldown > 0])

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email.trim() || cooldown > 0) return

    setBusy(true)
    setError("")
    try {
      await sendVerificationCode(email.trim())
      setStage("code")
      setCooldown(RESEND_COOLDOWN_SECONDS)
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

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (code.length < 6) return

    setBusy(true)
    setError("")
    try {
      const token = await verifyCode(email.trim(), code)
      setRegToken(token)
      setStage("password")
    } catch (exception) {
      setError(
        exception instanceof Error
          ? exception.message
          : message("platform_verification_failed")
      )
    } finally {
      setBusy(false)
    }
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || password.length < 6) return

    setBusy(true)
    setError("")
    try {
      await register(regToken, password, name, organization)
      onSuccess()
    } catch (exception) {
      setError(
        exception instanceof Error
          ? exception.message
          : message("platform_registration_failed")
      )
    } finally {
      setBusy(false)
    }
  }

  function resetToEmail() {
    setStage("email")
    setCode("")
    setRegToken("")
    setError("")
  }

  return (
    <div>
      {stage === "email" ? (
        <form className="flex flex-col gap-4" onSubmit={submitEmail}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="register-email">{t("platform_email")}</Label>
            <Input
              id="register-email"
              type="email"
              className="h-12"
              placeholder="name@example.com"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <SubmitButton
            icon={<LogIn className="size-4" />}
            busyIcon={<Loader2 className="size-4 animate-spin" />}
            busy={busy}
            disabled={busy || cooldown > 0 || !email.trim()}
            label={
              cooldown > 0
                ? t("platform_resend_countdown", { value1: cooldown })
                : t("platform_send_code")
            }
          />
        </form>
      ) : null}

      {stage === "code" ? (
        <div>
          <p className="text-sm text-muted-foreground">
            {t("platform_code_sent_to")}{" "}
            <span className="font-medium text-foreground">{email}</span>
          </p>
          <form className="mt-4 flex flex-col gap-4" onSubmit={submitCode}>
            <InputOTP
              maxLength={6}
              value={code}
              onChange={setCode}
              containerClassName="justify-center"
              aria-label={t("platform_verification_code")}
            >
              <InputOTPGroup className="gap-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <InputOTPSlot
                    key={index}
                    index={index}
                    className="h-12 w-10 rounded-lg border font-mono text-base"
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
            <SubmitButton
              icon={<LogIn className="size-4" />}
              busyIcon={<Loader2 className="size-4 animate-spin" />}
              busy={busy}
              disabled={busy || code.length < 6}
              label={t("platform_verify")}
            />
          </form>
          <div className="mt-3 flex justify-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetToEmail}
            >
              <ArrowLeft className="size-4" />
              {t("platform_back")}
            </Button>
          </div>
        </div>
      ) : null}

      {stage === "password" ? (
        <form className="flex flex-col gap-4" onSubmit={submitPassword}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="register-name">{t("platform_name")}</Label>
            <Input
              id="register-name"
              className="h-12"
              placeholder={t("platform_name")}
              autoComplete="name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="register-organization">
              {t("platform_organization")}
            </Label>
            <Input
              id="register-organization"
              className="h-12"
              placeholder={t("platform_enter_organization")}
              autoComplete="organization"
              required
              value={organization}
              onChange={(event) => setOrganization(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="register-password">{t("platform_password")}</Label>
            <Input
              id="register-password"
              type="password"
              className="h-12"
              placeholder={t("platform_password_minimum")}
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <SubmitButton
            icon={<UserPlus className="size-4" />}
            busyIcon={<Loader2 className="size-4 animate-spin" />}
            busy={busy}
            disabled={
              busy ||
              !name.trim() ||
              !organization.trim() ||
              password.length < 6
            }
            label={t("platform_complete_registration")}
          />
        </form>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm text-destructive">
          {error.startsWith("platform_") ? t(error) : error}
        </p>
      ) : null}
    </div>
  )
}

function SubmitButton({
  icon,
  busyIcon,
  busy,
  disabled,
  label,
}: {
  icon: ReactNode
  busyIcon: ReactNode
  busy: boolean
  disabled: boolean
  label: string
}) {
  return (
    <Button type="submit" size="lg" disabled={disabled}>
      {busy ? busyIcon : icon}
      {label}
    </Button>
  )
}

function SocialLoginButton({ image, label }: { image: string; label: string }) {
  return (
    <button
      type="button"
      className="size-12 rounded-lg border bg-card p-0 shadow-sm"
      aria-label={label}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} className="mx-auto size-5" alt="" />
    </button>
  )
}
