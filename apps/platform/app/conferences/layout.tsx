import type { Metadata } from "next"

import { localizedMetadata } from "@/i18n/metadata"

export async function generateMetadata(): Promise<Metadata> {
  return {
    ...(await localizedMetadata("platform_conferences")),
    robots: {
      index: false,
      follow: false,
    },
  }
}

export default function ConferencesLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return children
}
