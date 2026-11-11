/**
 * Manual mock for src/main/logger.ts
 * Prevents electron + electron-log from being loaded in test environment.
 */
export function createLogger(_tag: string) {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {}
  }
}

export function initializeLogging() {}

export const log = {
  scope: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {}
  }),
  transports: { file: { level: '' } },
  hooks: [],
  initialize: () => {}
}
