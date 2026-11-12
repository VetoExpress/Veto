import commonEn from './i18n/catalogs/common/en-US.json'
import commonZh from './i18n/catalogs/common/zh-CN.json'
import electronEn from './i18n/catalogs/electron/en-US.json'
import electronZh from './i18n/catalogs/electron/zh-CN.json'
import type { Locale } from '../shared/i18n'

export const messages = {
  'zh-CN': { ...commonZh, ...electronZh },
  'en-US': { ...commonEn, ...electronEn }
} as const

export type MessageKey = keyof (typeof messages)['zh-CN']
export type MessageValues = Record<string, string | number | Date>

export function translate(
  key: MessageKey,
  values: MessageValues = {},
  locale: Locale = 'zh-CN'
): string {
  const message = messages[locale][key]
  if (!message) return key
  return message.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name: string) => {
    const value = values[name]
    return value === undefined ? `{${name}}` : String(value)
  })
}
