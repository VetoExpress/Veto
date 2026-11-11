import {
  defaultLocale,
  isLocale,
  LOCALE_STORAGE_KEY,
  resolveLocale,
  translate,
  type Locale,
  type MessageKey,
  type MessageValues
} from '@vetoexpress/i18n'

let currentLocale = $state<Locale>(defaultLocale)
let localeRevision = 0

export function getLocale(): Locale {
  return currentLocale
}

export function t(key: MessageKey, values: MessageValues = {}): string {
  return translate(key, values, currentLocale)
}

export function applyLocale(locale: Locale): void {
  currentLocale = locale
  if (typeof document !== 'undefined') document.documentElement.lang = locale
}

export async function setLocale(locale: Locale): Promise<void> {
  if (!isLocale(locale)) return
  localeRevision += 1
  applyLocale(locale)
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch (error) {
    console.error('[i18n] Local preference write failed; current window remains translated', { locale, error })
  }
  if (window.veto?.i18n) {
    try {
      await window.veto.i18n.setLocale(locale)
    } catch (error) {
      console.error('[i18n] Desktop preference write failed; current window remains translated', { locale, error })
    }
  }
}

export function initializeLocale(): () => void {
  const revision = localeRevision
  const bridge = window.veto?.i18n
  const unsubscribe = bridge?.onLocaleChanged((locale: Locale) => {
    localeRevision += 1
    applyLocale(locale)
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    } catch (error) {
      console.error('[i18n] Desktop locale cache write failed; using in-memory preference', { locale, error })
    }
  })
  let stored: string | null = null
  try {
    stored = localStorage.getItem(LOCALE_STORAGE_KEY)
  } catch (error) {
    console.error('[i18n] Preference read failed; using system language', { error })
  }
  applyLocale(resolveLocale(stored ?? navigator.language))
  if (bridge) {
    void bridge.getLocale().then((locale: Locale) => {
      if (revision === localeRevision) applyLocale(locale)
    }).catch((error: unknown) => {
      console.error('[i18n] Desktop locale read failed; using browser preference', { error })
    })
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key === LOCALE_STORAGE_KEY && isLocale(event.newValue)) {
      localeRevision += 1
      applyLocale(event.newValue)
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    unsubscribe?.()
    window.removeEventListener('storage', onStorage)
  }
}

export function formatDate(
  value: Date | number | string,
  options: Intl.DateTimeFormatOptions = {}
): string {
  return new Intl.DateTimeFormat(currentLocale, options).format(new Date(value))
}

export function formatNumber(value: number, options: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(currentLocale, options).format(value)
}
