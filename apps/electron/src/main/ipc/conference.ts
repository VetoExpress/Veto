/**
 * ipc/conference.ts — 模拟大会 Display 窗口 IPC 处理器
 *
 * 管理双窗口模式下的 Display 窗口：
 * - openDisplay — 打开/复用 Display 窗口
 * - closeDisplay — 关闭 Display 窗口
 * - toggleFullscreen — 切换全屏
 */

import { ipcMain, BrowserWindow } from 'electron'
import { join } from 'path'
import { getAppUrl } from '../dev-server'

/** Display 窗口的可变引用 */
export interface DisplayWindowRef {
  current: BrowserWindow | null
}

/** 判断是否在开发模式 */
function isDev(): boolean {
  try {
    return !!process.env['ELECTRON_RENDERER_URL']
  } catch {
    return false
  }
}

export function registerConferenceIpc(displayWindow: DisplayWindowRef): void {
  ipcMain.handle(
    'veto:conference:open-display',
    async (_event, conferenceIdOrParams: string | { conferenceId?: string; label?: string }) => {
      const isParams = typeof conferenceIdOrParams === 'object'
      const conferenceId = isParams
        ? conferenceIdOrParams.conferenceId || 'standalone'
        : conferenceIdOrParams
      const label = isParams ? conferenceIdOrParams.label : undefined

      if (displayWindow.current && !displayWindow.current.isDestroyed()) {
        displayWindow.current.focus()
        return { success: true }
      }

      const win = new BrowserWindow({
        width: 1920,
        height: 1080,
        minWidth: 800,
        minHeight: 600,
        show: false,
        frame: false,
        center: true,
        autoHideMenuBar: true,
        title: label || 'VETO 大会 - 显示窗口',
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          sandbox: false,
          webSecurity: false,
          allowRunningInsecureContent: true,
          spellcheck: false
        }
      })

      win.on('ready-to-show', () => {
        win.show()
      })

      win.on('enter-full-screen', () => {
        win.webContents.send('veto:conference:display-update', {
          type: 'fullscreen-change',
          isFullScreen: true
        })
      })
      win.on('leave-full-screen', () => {
        win.webContents.send('veto:conference:display-update', {
          type: 'fullscreen-change',
          isFullScreen: false
        })
      })

      win.on('closed', () => {
        displayWindow.current = null
      })

      displayWindow.current = win

      const devUrl = process.env['ELECTRON_RENDERER_URL']
      const displayPath = `/display/${encodeURIComponent(conferenceId)}`
      if (isDev() && devUrl) {
        win.loadURL(getAppUrl(true, displayPath))
      } else {
        // Use a real pathname so SvelteKit resolves the display route.
        // The protocol handler falls back to index.html for this SPA route.
        win.loadURL(`veto://app${displayPath}`)
      }

      // 等待页面加载完成再发送配置
      await new Promise<void>((resolve) => {
        win.webContents.once('did-finish-load', () => resolve())
      })

      return { success: true }
    }
  )

  ipcMain.handle('veto:conference:close-display', () => {
    if (displayWindow.current && !displayWindow.current.isDestroyed()) {
      displayWindow.current.close()
      displayWindow.current = null
    }
    return { success: true }
  })

  ipcMain.handle('veto:conference:toggle-fullscreen', () => {
    if (displayWindow.current && !displayWindow.current.isDestroyed()) {
      displayWindow.current.setFullScreen(!displayWindow.current.isFullScreen())
      return { success: true, isFullScreen: displayWindow.current.isFullScreen() }
    }
    return { success: false }
  })
}
