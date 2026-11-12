import { defaultLocale, type Locale } from '../shared/i18n'
import { translate, type MessageKey, type MessageValues } from './i18n-messages'
import { createLogger } from './logger'

export { isLocale } from '../shared/i18n'

const log = createLogger('I18n')
let locale: Locale = defaultLocale
const listeners = new Set<(locale: Locale) => void>()

export function getLocale(): Locale {
  return locale
}

export function t(key: MessageKey, values: MessageValues = {}) {
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
