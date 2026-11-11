import type { Metadata } from "next"
import { localizedMetadata } from "@/i18n/metadata"

export async function generateMetadata(): Promise<Metadata> {
  return localizedMetadata("platform_login", "platform_login_description")
}

export default function LoginLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return children
}
