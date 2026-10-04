/**
 * store-bridge.ts
 * ──────────────────────────────────────────────
 * 渲染进程 ↔ 主进程文件存储的异步桥接层。
 * 封装 IPC 调用 + localStorage 同步 + 首次迁移。
 */

type StoreDomain = 'conferences' | 'checkpoints' | 'events' | 'battles' | 'settings' | 'tools'

/** 数据域 → localStorage key 映射 */
const LS_KEYS: Record<StoreDomain, string> = {
  conferences: 'veto_conferences',
  checkpoints: 'veto_committee_checkpoints',
  events: 'veto_conference_events',
  battles: 'wars_battles',
  settings: 'veto_global_settings',
  tools: 'veto_timeline'
}

/**
 * 启动时：从文件加载数据（文件是权威来源），同步到 localStorage。
 *
 * 加载顺序：
 * 1. 尝试从文件加载 → 如果存在，同步到 localStorage，返回数据
 * 2. 文件不存在 → 尝试从 localStorage 读取，迁移到文件，返回数据
 * 3. 都没有 → 返回 fallback
 */
export async function bootstrapStore<T>(domain: StoreDomain, fallback: T): Promise<T> {
  // 1. 从文件加载（权威来源）
  if (typeof window !== 'undefined' && window.veto?.store) {
    const fileData = await window.veto.store.load(domain)
    if (fileData != null) {
      // 同步到 localStorage，确保 store 可以同步读取
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LS_KEYS[domain], JSON.stringify(fileData))
      }
      return fileData as T
    }
  }

  // 2. 文件不存在 → 从 localStorage 迁移
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem(LS_KEYS[domain])
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as T
        if (typeof window !== 'undefined' && window.veto?.store) {
          await window.veto.store.migrate(domain, raw)
        }
        return parsed
      } catch (error) {
        if (domain === 'conferences' || domain === 'checkpoints') throw error
        /* 无效 JSON，跳过 */
      }
    }
  }

  // 3. 什么都没有 → 返回默认值
  return fallback
}

/**
 * 双重写入：同时写 localStorage 和文件。
 * 调用方可 fire-and-forget（不 await）。
 */
export async function saveToStore<T>(domain: StoreDomain, data: T): Promise<void> {
  // 写 localStorage（同步，供 store 快速读取）
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(LS_KEYS[domain], JSON.stringify(data))
  }
  // 写文件（异步 IPC，持久化 + 跨实例共享）
  if (typeof window !== 'undefined' && window.veto?.store) {
    await window.veto.store.save(domain, data)
  }
}

/**
 * 删除数据文件。
 */
export async function deleteFromStore(domain: StoreDomain): Promise<void> {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(LS_KEYS[domain])
  }
  if (typeof window !== 'undefined' && window.veto?.store) {
    await window.veto.store.delete(domain)
  }
}
