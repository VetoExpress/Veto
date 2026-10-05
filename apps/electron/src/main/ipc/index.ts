/**
 * ipc/index.ts — IPC 处理器统一注册入口
 *
 * 按领域拆分 IPC handler，通过本模块的 `registerAllIpcHandlers()` 一次性注册。
 *
 * 每个子模块遵循相同的模式：
 * - 导出一个 `registerXxxIpc(...)` 函数
 * - 只接收必需的依赖，避免全局变量
 */

import type { PluginInstance } from '../plugin-discovery'
import type { DisplayWindowRef } from './conference'
import { registerWindowIpc } from './window'
import { registerAppIpc } from './app'
import { registerDisplayIpc } from './display'
import { registerStoreIpc } from './store'
import { registerConfigIpc } from './config'
import { registerEventBusIpc } from './event-bus'
import { registerPluginsIpc } from './plugins'
import { registerAssetsIpc } from './assets'
import { registerConferenceIpc } from './conference'
import { registerUpdaterIpc } from './updater'
import { registerAccountIpc } from './account'

/** IPC 模块所需的运行时依赖 */
export interface IpcDependencies {
  pluginInstances: PluginInstance[]
  displayWindow: DisplayWindowRef
  refreshPlugins: () => void
}

/**
 * 注册所有 IPC 处理器（主进程入口调用一次）。
 *
 * @param deps — 各 IPC 模块所需的运行时依赖
 */
export function registerAllIpcHandlers(deps: IpcDependencies): void {
  // 无依赖模块
  registerWindowIpc()
  registerAppIpc()
  registerStoreIpc()
  registerEventBusIpc()
  registerUpdaterIpc()
  registerAccountIpc()

  // 有依赖模块
  registerDisplayIpc()
  registerConfigIpc(deps.refreshPlugins)
  registerPluginsIpc(deps.pluginInstances, deps.refreshPlugins)
  registerAssetsIpc(deps.pluginInstances)
  registerConferenceIpc(deps.displayWindow)
}
