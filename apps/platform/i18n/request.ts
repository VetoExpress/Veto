import { cookies } from "next/headers"
import { getRequestConfig } from "next-intl/server"
import { LOCALE_COOKIE, messages, resolveLocale } from "@vetoexpress/i18n"

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value)
  return { locale, messages: messages[locale], timeZone: "Asia/Shanghai" }
})
