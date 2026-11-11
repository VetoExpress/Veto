import type { Metadata } from "next"
import { localizedMetadata } from "@/i18n/metadata"

export async function generateMetadata(): Promise<Metadata> {
  return localizedMetadata("platform_conference_details")
}

export default function ConferenceLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return children
}
