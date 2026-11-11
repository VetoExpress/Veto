/**
 * ipc/store.ts — 应用数据存储 IPC 处理器
 *
 * 为 Renderer 提供文件持久化接口（CRUD + 迁移）。
 * 底层通过 data/store.ts 操作 JSON 文件。
 */

import { ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import {
  loadStore,
  saveStore,
  deleteStore,
  migrateFromLocalStorage,
  type StoreDomain
} from '../data/store'
import { t } from '../i18n'
import { createLogger } from '../logger'
import { isTrustedAppFrame } from './trusted-origin'

const log = createLogger('IpcStore')

function rendererDomain(event: IpcMainInvokeEvent, domain: string): StoreDomain {
  if (!isTrustedAppFrame(event)) {
    log.warn('Rejected generic store access from untrusted frame', {
      origin: event.senderFrame?.origin
    })
    throw new Error(t('electron_i18n_access_denied'))
  }
  if (!['conferences', 'checkpoints', 'events', 'battles', 'settings', 'tools'].includes(domain)) {
    log.warn('Rejected access to main-process language preferences through generic store IPC')
    throw new Error(t('electron_i18n_access_denied'))
  }
  return domain as StoreDomain
}

export function registerStoreIpc(): void {
  ipcMain.handle('veto:store:load', (event, domain: string) => {
    return loadStore(rendererDomain(event, domain))
  })

  ipcMain.handle('veto:store:save', (event, domain: string, data: unknown) => {
    saveStore(rendererDomain(event, domain), data)
    return { success: true }
  })

  ipcMain.handle('veto:store:delete', (event, domain: string) => {
    deleteStore(rendererDomain(event, domain))
    return { success: true }
  })

  ipcMain.handle('veto:store:migrate', (event, domain: string, jsonData: string) => {
    migrateFromLocalStorage(rendererDomain(event, domain), jsonData)
    return { success: true }
  })
}
