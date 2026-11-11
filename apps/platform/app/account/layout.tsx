import type { Metadata } from "next"
import { localizedMetadata } from "@/i18n/metadata"

export async function generateMetadata(): Promise<Metadata> {
  return {
    ...(await localizedMetadata("platform_account")),
    robots: {
      index: false,
      follow: false,
    },
  }
}

export default function AccountLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return children
}
