/**
 * seat-preset-store.ts
 * ──────────────────────────────────────────────
 * 席位预设 Store — 从所有已安装插件中收集参会席位预设，
 * 供创建大会流程使用。
 */

import { writable, get } from 'svelte/store'
import {
  dbGetAllPlugins,
  installedPluginsRevision,
  ensureStorageInitialized
} from '$lib/classes/services/plugin/plugin-db'

// ---- 类型 ----

export interface SeatPresetEntry {
  name: string
  shortName?: string
  flagUrl?: string
  /** 是否拥有投票权（默认 true，false 即为观察员） */
  hasVotingRights?: boolean
}

export interface SeatPreset {
  /** 来源插件 ID */
  pluginId: string
  /** 来源插件名称 */
  pluginName: string
  /** 预设 ID */
  presetId: string
  /** 预设名称 */
  presetName: string
  /** 预设描述 */
  description?: string
  /** 席位列表 */
  seats: SeatPresetEntry[]
}

/** seats.json 的顶层结构 */
interface SeatsFile {
  presets?: Array<{
    id: string
    name: string
    description?: string
    seats: SeatPresetEntry[]
  }>
}

// ---- Store ----

/** 所有可用的席位预设 */
export const seatPresets = writable<SeatPreset[]>([])

/** 是否正在加载 */
export const presetsLoading = writable(false)

/** 是否已加载完成 */
export const presetsLoaded = writable(false)

// ---- 加载逻辑 ----

function parseSeatsJson(
  pluginId: string,
  pluginName: string,
  jsonStr: string
): SeatPreset[] {
  try {
    const data = JSON.parse(jsonStr) as SeatsFile

    // 格式：{ "presets": [...] }
    if (data.presets && Array.isArray(data.presets)) {
      return data.presets.map((p) => ({
        pluginId,
        pluginName,
        presetId: p.id ?? '',
        presetName: p.name ?? p.id ?? '',
        description: p.description,
        seats: p.seats ?? []
      }))
    }

    return []
  } catch {
    console.warn(`[SeatPresets] 无法解析插件 "${pluginId}" 的 seats.json`)
    return []
  }
}

/** 从所有已安装插件加载席位预设 */
export async function loadSeatPresets(): Promise<void> {
  if (get(presetsLoading)) return

  presetsLoading.set(true)

  try {
    await ensureStorageInitialized()
    const plugins = await dbGetAllPlugins()
    const allPresets: SeatPreset[] = []

    for (const plugin of plugins) {
      if (plugin.seats) {
        const presets = parseSeatsJson(
          plugin.id,
          plugin.manifest.name,
          plugin.seats
        )
        allPresets.push(...presets)
      }
    }

    seatPresets.set(allPresets)
    presetsLoaded.set(true)
  } catch (err) {
    console.error('[SeatPresets] 加载预设失败:', err)
  } finally {
    presetsLoading.set(false)
  }
}

// ---- 格式化工具 ----

/** 将预设格式化为 textarea 文本（全称,简称[,observer] 每行一个） */
export function formatPresetAsText(preset: SeatPreset): string {
  return preset.seats
    .map((d) => {
      let line = d.name
      if (d.shortName) line += `,${d.shortName}`
      if (d.hasVotingRights === false) line += ',observer'
      return line
    })
    .join('\n')
}

// ---- 自动刷新 ----

// 当插件列表变化时（安装/卸载），自动重新加载预设
let _revisionUnsub: (() => void) | null = null

export function startAutoRefresh(): void {
  if (_revisionUnsub) return
  _revisionUnsub = installedPluginsRevision.subscribe(() => {
    // 只有在已经加载过的情况下才自动刷新
    if (get(presetsLoaded)) {
      loadSeatPresets()
    }
  })
}

export function stopAutoRefresh(): void {
  if (_revisionUnsub) {
    _revisionUnsub()
    _revisionUnsub = null
  }
}
