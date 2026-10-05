"use client"

import { Loader2 } from "lucide-react"

import { PlatformLoading, PlatformShell } from "@/components/platform-shell"
import { AccountProfile } from "@/components/account-profile"
import { Card, CardContent } from "@/components/ui/card"
import { TextAnimate } from "@/components/ui/text-animate"
import type { PlatformUser } from "@/lib/auth-client"
import { usePlatformAuth } from "@/lib/use-platform-auth"
import { usePlatformUser } from "@/lib/use-platform-user"

export default function AccountPage() {
  const { token, isReady, signOut } = usePlatformAuth()
  const { user, error } = usePlatformUser(token, signOut)

  if (!isReady) return <PlatformLoading />

  return (
    <PlatformShell backHref="/" backLabel="返回大会列表">
      <section className="border-b pb-10">
        <TextAnimate
          as="h1"
          animation="blurInUp"
          by="word"
          className="platform-title text-4xl font-bold tracking-[-0.04em] text-balance sm:text-5xl"
        >
          个人中心
        </TextAnimate>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
          管理个人资料、账号安全与登录状态。
        </p>
      </section>

      <section className="pt-10">
        {error ? (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          >
            {error}
          </div>
        ) : user ? (
          <AccountProfile
            key={token}
            user={user}
            token={token!}
            onSignOut={signOut}
          />
        ) : (
          <Card className="bg-card/70 shadow-none ring-0">
            <CardContent className="grid place-items-center py-20">
              <Loader2
                className="animate-spin text-muted-foreground"
                aria-label="正在加载用户信息"
              />
            </CardContent>
          </Card>
        )}
      </section>
    </PlatformShell>
  )
}
