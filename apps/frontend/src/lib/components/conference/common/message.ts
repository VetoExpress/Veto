import type { MessageKey } from '$lib/i18n'
import { t } from '$lib/i18n'

export type ProcedureMessage = string | {
  key: MessageKey
  values?: Record<string, string | number | Date>
}

export function procedureMessage(
  key: MessageKey,
  values?: Record<string, string | number | Date>
): ProcedureMessage {
  return { key, values }
}

export function renderProcedureMessage(message: ProcedureMessage): string {
  return typeof message === 'string' ? message : t(message.key, message.values)
}
