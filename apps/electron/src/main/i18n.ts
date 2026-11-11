import { defaultLocale, locales, translate, type Locale } from '@vetoexpress/i18n'
import { createLogger } from './logger'

const log = createLogger('I18n')
let locale: Locale = defaultLocale
const listeners = new Set<(locale: Locale) => void>()

export function getLocale(): Locale {
  return locale
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && locales.some((locale) => locale === value)
}

export function t(
  key: Parameters<typeof translate>[0],
  values: Parameters<typeof translate>[1] = {}
) {
  return translate(key, values, locale)
}

export function onLocaleChanged(listener: (locale: Locale) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function updateLocale(next: Locale): void {
  if (locale === next) return
  locale = next
  for (const listener of listeners) {
    try {
      listener(next)
    } catch (error) {
      log.error(
        'Locale subscriber failed; other subscribers will still be notified',
        { locale: next },
        error
      )
    }
  }
}
