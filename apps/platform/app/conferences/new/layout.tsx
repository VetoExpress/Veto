import type { Metadata } from "next"
import { localizedMetadata } from "@/i18n/metadata"

export async function generateMetadata(): Promise<Metadata> {
  return localizedMetadata("platform_create_conference")
}

export default function NewConferenceLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return children
}
