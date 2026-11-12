import { headers } from "next/headers"
import { getRequestConfig } from "next-intl/server"
import { messages, resolveLocale } from "./messages"

export default getRequestConfig(async () => {
  const requestHeaders = await headers()
  const locale = resolveLocale(
    requestHeaders.get("x-veto-locale") ?? requestHeaders.get("accept-language")
  )
  return { locale, messages: messages[locale], timeZone: "Asia/Shanghai" }
})
