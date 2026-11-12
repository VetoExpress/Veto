import { NextResponse, type NextRequest } from "next/server"
import { isLocale, LOCALE_COOKIE, resolvePreferredLocale } from "./i18n/locale"

export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers)
  const desktopLocale = request.headers.get("x-veto-locale")
  const requestedLocale = request.nextUrl.searchParams.get("lang")
  const savedLocale = request.cookies.get(LOCALE_COOKIE)?.value
  const locale = isLocale(desktopLocale)
    ? desktopLocale
    : isLocale(requestedLocale)
      ? requestedLocale
      : isLocale(savedLocale)
        ? savedLocale
        : resolvePreferredLocale(request.headers.get("accept-language"))

  headers.set("x-veto-locale", locale)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
}
