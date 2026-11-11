/**
 * ipc/app.ts — 应用工具 IPC 处理器
 */

import { ipcMain, BrowserWindow, shell } from 'electron'
import { t } from '../i18n'

export function registerAppIpc(): void {
  ipcMain.handle('veto:app:open-devtools', () => {
    const win = BrowserWindow.getFocusedWindow()
    if (win) {
      win.webContents.openDevTools({ mode: 'detach' })
      return { success: true }
    }
    return { success: false, error: t('electron_app_window_not_found') }
  })
}

ipcMain.handle('veto:open-external', async (_event, url: string) => {
  await shell.openExternal(url)
})
