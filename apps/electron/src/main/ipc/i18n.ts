import { ipcMain } from 'electron'
import { getLocale, isLocale, t } from '../i18n'
import { setDesktopLocale } from '../desktop-i18n'
import { createLogger } from '../logger'
import { isTrustedAppFrame } from './trusted-origin'

const log = createLogger('IpcI18n')

export function registerI18nIpc(): void {
  ipcMain.handle('veto:i18n:get-locale', (event) => {
    if (!isTrustedAppFrame(event)) {
      log.warn('Rejected locale read from untrusted frame', { origin: event.senderFrame?.origin })
      throw new Error(t('electron_i18n_access_denied'))
    }
    return getLocale()
  })
  ipcMain.handle('veto:i18n:set-locale', (event, locale: unknown) => {
    if (!isTrustedAppFrame(event)) {
      log.warn('Rejected locale change from untrusted frame', { origin: event.senderFrame?.origin })
      throw new Error(t('electron_i18n_access_denied'))
    }
    if (!isLocale(locale)) {
      log.warn('Rejected unsupported locale; current language unchanged', {
        valueType: typeof locale
      })
      throw new Error(t('electron_i18n_invalid_locale'))
    }
    setDesktopLocale(locale)
  })
}
