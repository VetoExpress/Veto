import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { AccountSnapshot, DesktopAccountAPI } from '@vetoexpress/auth/desktop'
import type { AccountUpdate } from '@vetoexpress/auth'

// Custom APIs for renderer
const api = {}

// ── Veto Plugin API ────────────────────────────────────────────────────

const veto = {
  account: {
    getAccessToken: () => ipcRenderer.invoke('veto:account:get-access-token'),
    adoptToken: (token: string, onlyIfSignedOut?: boolean) =>
      ipcRenderer.invoke('veto:account:adopt-token', token, onlyIfSignedOut),
    getSession: () => ipcRenderer.invoke('veto:account:get-session'),
    login: (email: string, password: string) =>
      ipcRenderer.invoke('veto:account:login', email, password),
    refresh: () => ipcRenderer.invoke('veto:account:refresh'),
    updateProfile: (update: AccountUpdate) =>
      ipcRenderer.invoke('veto:account:update-profile', update),
    signOut: (expectedToken?: string) => ipcRenderer.invoke('veto:account:sign-out', expectedToken),
    onChanged: (callback: (session: AccountSnapshot) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, session: AccountSnapshot) =>
        callback(session)
      ipcRenderer.on('veto:account:changed', listener)
      return () => ipcRenderer.removeListener('veto:account:changed', listener)
    }
  } satisfies DesktopAccountAPI,
  openExternal: (url: string) => {
    return ipcRenderer.invoke('veto:open-external', url)
  },

  plugins: {
    /** 获取已安装插件列表 */
    list: (): Promise<
      Array<{
        id: string
        name: string
        version: string
        author: string
        type: string
        description?: string
        disabled: boolean
        incompatible: boolean
        dependencies?: string[]
        injects?: {
          formulas?: string
          events?: string
          ui?: string
        }
        hasDefinitions: boolean
        hasI18n: boolean
        hasAssets: boolean
        hasSeats: boolean
      }>
    > => ipcRenderer.invoke('veto:plugins:list'),

    /** 获取插件详情（含 definitions / seats 等内容） */
    get: (
      pluginId: string
    ): Promise<{
      manifest: Record<string, unknown>
      definitions: string | null
      i18n: Record<string, string>
      campaignFiles?: Record<string, string>
      seats?: string | null
      disabled: boolean
      incompatible: boolean
    } | null> => ipcRenderer.invoke('veto:plugins:get', pluginId),

    /** 启用/禁用插件 */
    toggle: (pluginId: string, enabled: boolean): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('veto:plugins:toggle', pluginId, enabled),

    /** 卸载插件 */
    uninstall: (pluginId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('veto:plugins:uninstall', pluginId),

    /** 安装插件 */
    install: (payload: {
      manifest: Record<string, unknown>
      definitions: string | null
      i18n: Record<string, string>
      assets: Array<{ path: string; data: string; mimeType: string }>
      seats?: string | null
    }): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('veto:plugins:install', payload),

    /** 列出插件子目录中的 JSON 文件 */
    listFiles: (pluginId: string, subDir: string): Promise<string[]> =>
      ipcRenderer.invoke('veto:plugins:list-files', pluginId, subDir),

    /** 批量读取插件内的文件 */
    readFiles: (pluginId: string, filePaths: string[]): Promise<Record<string, string>> =>
      ipcRenderer.invoke('veto:plugins:read-files', pluginId, filePaths)
  },

  config: {
    /** 获取插件配置 */
    get: (): Promise<{ disabled: string[]; order?: string[] }> =>
      ipcRenderer.invoke('veto:config:get'),

    /** 保存插件配置 */
    set: (config: { disabled: string[]; order?: string[] }): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('veto:config:set', config)
  },

  assets: {
    /** 获取插件资源的 base64 data URL */
    get: (
      pluginId: string,
      assetPath: string
    ): Promise<{ data: string; mimeType: string } | null> =>
      ipcRenderer.invoke('veto:assets:get', pluginId, assetPath)
  },

  events: {
    /** 订阅主进程事件（返回取消订阅函数） */
    on: (event: string, callback: (data: unknown) => void): (() => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { event: string; data: unknown }
      ) => {
        if (payload.event === event) {
          callback(payload.data)
        }
      }
      ipcRenderer.on('veto:event', listener)
      return () => {
        ipcRenderer.removeListener('veto:event', listener)
      }
    }
  },

  store: {
    /** 从文件加载数据 */
    load: (domain: string): Promise<unknown> => ipcRenderer.invoke('veto:store:load', domain),

    /** 保存数据到文件 */
    save: (domain: string, data: unknown): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('veto:store:save', domain, data),

    /** 删除数据文件 */
    delete: (domain: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('veto:store:delete', domain),

    /** 从 localStorage 迁移数据到文件（仅当文件不存在时） */
    migrate: (domain: string, jsonData: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('veto:store:migrate', domain, jsonData)
  },

  updater: {
    /** 检查更新 */
    check: (): Promise<{ success: boolean; result?: unknown; error?: string }> =>
      ipcRenderer.invoke('veto:updater:check'),

    /** 下载更新 */
    download: (): Promise<{ success: boolean; result?: unknown; error?: string }> =>
      ipcRenderer.invoke('veto:updater:download'),

    /** 退出并安装更新 */
    quitAndInstall: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('veto:updater:quit-and-install'),

    /** 获取当前应用版本 */
    getVersion: (): Promise<string> => ipcRenderer.invoke('veto:updater:get-version')
  },

  app: {
    /** 打开开发者工具 */
    openDevTools: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('veto:app:open-devtools')
  },

  conference: {
    /** 打开显示窗口 */
    openDisplay: (
      conferenceIdOrParams: string | { conferenceId?: string; label?: string }
    ): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('veto:conference:open-display', conferenceIdOrParams),

    /** 关闭显示窗口 */
    closeDisplay: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('veto:conference:close-display'),

    /** 切换 Display 窗口全屏 */
    toggleFullscreen: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('veto:conference:toggle-fullscreen'),

    /** 监听来自主机的数据更新（显示窗口侧使用） */
    onDisplayUpdate: (callback: (data: unknown) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: unknown) => {
        callback(data)
      }
      ipcRenderer.on('veto:conference:display-update', listener)
      return () => {
        ipcRenderer.removeListener('veto:conference:display-update', listener)
      }
    }
  },

  displayWs: {
    getPort: (): Promise<number> => ipcRenderer.invoke('veto:display:get-port')
  },

  services: {
    /** 获取运行中的 service 插件列表 */
    list: (): Promise<
      Array<{
        id: string
        name: string
        version: string
        type: string
        running: boolean
        startedAt?: number
        status?: Record<string, unknown>
      }>
    > => ipcRenderer.invoke('veto:services:list'),

    /** 重新加载指定 service 插件 */
    reload: (pluginId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('veto:services:reload', pluginId),

    /** 向主进程 EventBus 发送事件（用于 Renderer → Service 推送） */
    emitEvent: (type: string, data?: Record<string, unknown>): void => {
      ipcRenderer.send('veto:event-bus:emit', { type, data })
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('veto', veto)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
  // @ts-ignore (define in dts)
  window.veto = veto
}
