import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { AppEnvironment } from "@/components/app-environment"
import { siteUrl } from "@/lib/site"
import { cn } from "@/lib/utils"
import { getLocale } from "next-intl/server"
import type { Locale } from "@vetoexpress/i18n"
import { platformTranslate } from "@/i18n/messages"
import { I18nProvider } from "@/components/i18n-provider"

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as Locale
  const t = (key: string) => platformTranslate(key, {}, locale)
  const name = t("platform_brand")
  const description = t("platform_site_description")
  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: name,
      template: `%s | ${name}`,
    },
    description,
    keywords: [
      name,
      "Veto",
      t("platform_model_united_nations"),
      "MUN",
      t("platform_conferences"),
      t("platform_crisis_simulation"),
      t("platform_organizer_platform"),
    ],
    applicationName: name,
    openGraph: {
      type: "website",
      locale: locale === "zh-CN" ? "zh_CN" : "en_US",
      url: "/",
      siteName: name,
      title: name,
      description,
      images: [
        {
          url: "/og-image.png",
          width: 1200,
          height: 630,
          alt: platformTranslate(
            "platform_social_image_alt",
            { value1: name },
            locale
          ),
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
    },
  }
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = (await getLocale()) as Locale
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        geist.variable
      )}
    >
      <body>
        <I18nProvider initialLocale={locale}>
          <ThemeProvider>
            <AppEnvironment>{children}</AppEnvironment>
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  )
}
