/**
 * index.ts — VetoExpress Plugin Host
 *
 * Host 入口 = module-injector.ts 中的 Module._load 拦截。
 * 导入本文件即激活 veto 虚拟模块注入。
 *
 * 架构（类比 VS Code Extension Host）：
 *
 *   Module._load         ← Host 入口，拦截 require("veto") / import "veto"
 *   plugin-loader.ts     ← 在此之上：注册 API → dynamic import → activate
 *   api.ts               ← Logger 实现 + PluginContext 构建
 *
 * 用法：
 *   import { loadPlugin, unloadPlugin, unloadAll } from './plugin-host/extension-host'
 *   await loadPlugin('/path/to/plugin')
 *   // ...
 *   await unloadAll()
 */

// 导入 module-injector 触发 Module._load monkey-patch（副作用导入）
import './module-injector'

// 从 plugin-loader 重导出公共 API
export {
  loadPlugin,
  unloadPlugin,
  unloadAll,
  getLoadedPlugins,
  getPluginState,
  loadedCount
} from './plugin-loader'

export type { LoadedPlugin } from './plugin-loader'
export type { VetoLogger, VetoPluginContext, VetoApi } from './api'
