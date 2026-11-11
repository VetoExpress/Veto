import * as m from './generated/messages/_index.js'
import type { Locale } from './locale'
import { defaultLocale } from './locale'
import { messages } from './catalogs'

export { messages } from './catalogs'
export * from './locale'

export type MessageKey = keyof (typeof messages)['zh-CN']
export type MessageValues = Record<string, string | number | Date>

export function translate(
  key: MessageKey,
  values: MessageValues = {},
  locale: Locale = defaultLocale
): string {
  const message = m[key] as (inputs: MessageValues, options: { locale: Locale }) => string
  return message(values, { locale })
}
