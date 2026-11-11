/**
 * module-injector.ts — veto 虚拟模块注入
 *
 * 拦截 Node.js 的 Module._load，当插件代码请求 require("veto") 或
 * import "veto" 时，返回 Host 提供的 API 对象。
 *
 * 原理与 VS Code 的 NodeModuleRequireInterceptor 一致：
 *   src/vs/workbench/api/node/extHostExtensionService.ts
 *
 * CJS 和 ESM 兼容：
 *   - CJS: require("veto") 直接走 Module._load 拦截
 *   - ESM: Node.js 内部也用 Module._load 解析裸标识符（bare specifier），
 *     拦截同样生效。但 import 语句是静态的，需要在动态 import() 之前
 *     完成拦截注册。
 */

import Module from 'node:module'

// Module._load is an internal Node.js API — not exposed via @types/node.
// We access it via bracket notation to avoid TypeScript compiler errors.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _originalLoad = (Module as any)._load as (
  request: string,
  parent: Module | undefined,
  isMain: boolean
) => unknown

/** 插件目录 → API 对象的映射 */
const pluginApiRegistry = new Map<string, Record<string, unknown>>()

// ── Monkey-patch ────────────────────────────────────────────────────────────

;(Module as any)._load = function (
  request: string,
  parent: Module | undefined,
  _isMain: boolean
): unknown {
  // 拦截对 "veto" 模块的请求
  if (request === 'veto' && parent) {
    const api = lookupApi(parent)
    if (api) {
      return api
    }
  }

  // eslint-disable-next-line prefer-rest-params
  return _originalLoad.apply(this, arguments as unknown as [string, Module | undefined, boolean])
}

// ── 查找 API ────────────────────────────────────────────────────────────────

/**
 * 根据调用者的文件路径，查找匹配的插件 API。
 * 遍历注册表，找到 parent.filename 所属的插件目录。
 */
function lookupApi(parent: Module): Record<string, unknown> | null {
  const callerPath = parent.filename ?? parent.path
  if (!callerPath) return null

  for (const [pluginDir, api] of pluginApiRegistry) {
    if (callerPath.startsWith(pluginDir)) {
      return api
    }
  }

  return null
}

// ── 公共 API ────────────────────────────────────────────────────────────────

/**
 * 注册一个插件的 API 对象。
 * 插件加载前调用，确保该插件内的 require("veto") 返回正确的 API。
 */
export function registerPluginApi(pluginDir: string, api: Record<string, unknown>): void {
  pluginApiRegistry.set(pluginDir, api)
}

/**
 * 取消注册。
 * 插件 deactivate 后调用，防止内存泄漏。
 */
export function unregisterPluginApi(pluginDir: string): void {
  pluginApiRegistry.delete(pluginDir)
}

/**
 * 检查 "veto" 拦截是否已生效。
 * 调试用 —— 如果别的包恰好也叫 "veto" 且未被拦截，可借此排查。
 */
export function isVetoIntercepted(): boolean {
  return _originalLoad !== (Module as any)._load
}
