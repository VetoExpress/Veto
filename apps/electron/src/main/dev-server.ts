const DEFAULT_DEV_SERVER_URL = 'http://127.0.0.1:5173'

export function getDevServerUrl(): string {
  const configured = process.env['ELECTRON_RENDERER_URL']?.trim()
  return configured ? configured.replace(/\/+$/, '') : DEFAULT_DEV_SERVER_URL
}

export function getDevServerOrigin(): string {
  try {
    return new URL(getDevServerUrl()).origin
  } catch {
    return new URL(DEFAULT_DEV_SERVER_URL).origin
  }
}

export function getAppUrl(development: boolean, pathname = '/'): string {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`
  return development ? `${getDevServerUrl()}${path}` : `veto://app${path}`
}
