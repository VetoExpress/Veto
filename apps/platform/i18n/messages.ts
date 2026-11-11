import { createTranslator } from "next-intl"
import { defaultLocale, messages, type Locale } from "@vetoexpress/i18n"

export type MessageValues = Record<string, string | number | Date>
export type TranslationKey =
  | Extract<keyof (typeof messages)["zh-CN"], `platform_${string}`>
  | Extract<keyof (typeof messages)["zh-CN"], `common_${string}`>
const translators = new Map<Locale, ReturnType<typeof createTranslator>>()

export function platformTranslate(
  key: string,
  values: MessageValues = {},
  locale: Locale = defaultLocale
): string {
  if (key.startsWith("veto-message:")) {
    const decoded = JSON.parse(key.slice(13)) as {
      key: string
      values: MessageValues
    }
    return platformTranslate(decoded.key, decoded.values, locale)
  }
  const messageKey = key
  if (!messageKey.startsWith("platform_") && !messageKey.startsWith("common_"))
    return key
  let translator = translators.get(locale)
  if (!translator) {
    translator = createTranslator({ locale, messages: messages[locale] })
    translators.set(locale, translator)
  }
  return translator(messageKey, values)
}

export function message(key: string, values: MessageValues = {}): string {
  if (!key.startsWith("platform_") && !key.startsWith("common_")) return key
  return Object.keys(values).length
    ? `veto-message:${JSON.stringify({ key, values })}`
    : key
}
