import { messages, translate, type Locale } from '@vetoexpress/i18n'
import { t } from '$lib/i18n'
import type { ConferenceEntry } from '$lib/classes/types/committee'

export function getEntryDescription(
  entry: Pick<ConferenceEntry, 'description' | 'messageKey' | 'messageValues'>,
  locale?: Locale
): string {
  if (!entry.messageKey || !Object.hasOwn(messages['zh-CN'], entry.messageKey)) {
    return entry.description
  }
  return locale
    ? translate(entry.messageKey, entry.messageValues, locale)
    : t(entry.messageKey, entry.messageValues)
}
