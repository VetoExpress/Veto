import type { Metadata } from "next"
import { getLocale } from "next-intl/server"
import type { Locale } from "@vetoexpress/i18n"
import { platformTranslate } from "./messages"

export async function localizedMetadata(
  title: string,
  description?: string
): Promise<Metadata> {
  const locale = (await getLocale()) as Locale
  return {
    title: platformTranslate(title, {}, locale),
    ...(description
      ? { description: platformTranslate(description, {}, locale) }
      : {}),
  }
}
