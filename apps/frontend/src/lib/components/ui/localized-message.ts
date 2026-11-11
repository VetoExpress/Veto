export type LocalizedMessage = string | (() => string)

export function messageText(message: LocalizedMessage | null | undefined): string {
  return typeof message === 'function' ? message() : message ?? ''
}
