import { app, BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import { defaultLocale, resolveLocale, type Locale } from '../shared/i18n'
import { loadStore, saveStore } from './data/store'
import { getLocale, isLocale, onLocaleChanged, t, updateLocale } from './i18n'
import { isAccountOrigin } from './ipc/trusted-origin'
import { createLogger } from './logger'

const log = createLogger('DesktopI18n')
const titles = new Map<BrowserWindow, Parameters<typeof t>[0]>()
let initialized = false

function loadPreferences(): Record<string, unknown> {
  const value = loadStore<unknown>('preferences')
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function persist(locale: Locale): void {
  try {
    saveStore('preferences', { ...loadPreferences(), locale })
  } catch (error) {
    log.error(
      'Failed to persist language preference; current language remains active until restart',
      { locale },
      error
    )
  }
}

export function bindWindowTitle(window: BrowserWindow, key: Parameters<typeof t>[0]): void {
  titles.set(window, key)
  window.setTitle(t(key))
  window.on('page-title-updated', (event) => event.preventDefault())
  window.on('closed', () => titles.delete(window))
}

function notifyWindows(locale: Locale): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    try {
      const title = titles.get(window)
      if (title) window.setTitle(t(title))
    } catch (error) {
      log.warn(
        'Failed to update window title after language change',
        { locale, windowId: window.id },
        error
      )
    }
    try {
      if (isAccountOrigin(window.webContents.mainFrame.origin, is.dev)) {
        window.webContents.send('veto:i18n:locale-changed', locale)
      }
    } catch (error) {
      log.warn(
        'Failed to notify window of language change; it can read the current locale on reconnect',
        { locale, windowId: window.id },
        error
      )
    }
  }
}

export function initializeDesktopI18n(): void {
  if (initialized) return
  initialized = true
  let initial: Locale = defaultLocale
  try {
    const languages = app.getPreferredSystemLanguages()
    const supported = languages.find((value) => /^(zh|en)(-|$)/i.test(value))
    initial = resolveLocale(supported ?? app.getLocale())
  } catch (error) {
    log.warn('Failed to read system language; using default locale', { locale: initial }, error)
  }
  try {
    const saved = loadPreferences().locale
    if (isLocale(saved)) initial = saved
    else if (saved !== undefined) {
      log.warn('Invalid saved language preference; using system language', {
        locale: initial,
        valueType: typeof saved
      })
    }
  } catch (error) {
    log.warn(
      'Failed to restore language preference; using system language',
      { locale: initial },
      error
    )
  }
  updateLocale(initial)
  persist(initial)
  onLocaleChanged(notifyWindows)
}

export function setDesktopLocale(locale: Locale): void {
  updateLocale(locale)
  persist(getLocale())
}
