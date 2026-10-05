import { writable, derived, get } from 'svelte/store'
import type {
  Battle,
  EventSetting,
  Faction,
  UnitTemplate,
  PlacedUnit,
  ActionLogEntry,
  UnitSide
} from '$lib/classes/types/battle'
import { registry } from '$lib/classes/services/plugin/mod-registry.svelte'
import {
	applyStatusEffect,
	removeStatusEffect,
	hasStatusEffect,
	getEffectiveStats
} from '$lib/classes/services/engine/registry/status-registry'
import {
	getMaxDetectionRange,
	isUnitConfirmed,
	getContactsForFaction
} from '$lib/classes/services/engine/registry/sensor-registry'
import type { StatusInstance, MessageCategory } from '$lib/classes/types/battle'
import { gameClock } from '$lib/classes/services/engine/game-clock.store'
import { resolveStatus } from '$lib/classes/services/engine/status-resolver'
import { bootstrapStore, saveToStore, deleteFromStore } from '../../helpers/store-bridge'

const STORAGE_KEY = 'wars_battles'
const STORE_DOMAIN = 'battles'

function generateId(): string {
  return crypto.randomUUID()
}

function loadBattlesFromStorage(): Battle[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

let _saveTimer: ReturnType<typeof setTimeout> | null = null
function saveBattlesToStorage(battles: Battle[]) {
  if (typeof localStorage === 'undefined') return
  // 节流：最多每 2 秒存一次，避免 tick 每帧写 localStorage
  if (_saveTimer) clearTimeout(_saveTimer)
  _saveTimer = setTimeout(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(battles))
    // 双重写入：同步写文件
    saveToStore(STORE_DOMAIN, battles)
  }, 2000)
}

/**
 * 手动保存：flush 运行时位置 + 写入 localStorage + toast 提示。
 * 在 UI 按钮和快捷键中统一使用，避免重复代码。
 */
export async function saveBattleWithToast() {
  const { toast } = await import('svelte-sonner')
  flushRuntimePositions()
  await saveBattlesNow()
  toast.success('已保存', { description: '当前推演状态已保存。' })
}

/** 立即将当前 battles 状态写入 localStorage 和文件（绕过防抖），用于手动保存。 */
export async function saveBattlesNow(): Promise<void> {
  if (typeof localStorage === 'undefined') return
  if (_saveTimer) {
    clearTimeout(_saveTimer)
    _saveTimer = null
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(get(battles)))
  await saveToStore(STORE_DOMAIN, get(battles))
}

// ============ 所有战局列表 ============
export const battles = writable<Battle[]>(loadBattlesFromStorage())
battles.subscribe(saveBattlesToStorage)

/** 启动完成 Promise：文件数据已加载并同步到 localStorage */
export const battlesReady: Promise<void> = bootstrapStore<Battle[]>(STORE_DOMAIN, []).then((data) => {
  battles.set(data)
})

// ============ 当前激活的战局ID ============
export const currentBattleId = writable<string | null>(null)

// ============ 当前战局(派生) ============
export const currentBattle = derived(
  [battles, currentBattleId],
  ([$battles, $id]) => $battles.find((b) => b.id === $id) ?? null
)

// ============ 当前选中的阵营ID ============
export const currentFactionId = writable<string | null>(null)

// ============ 当前阵营(派生) ============
export const currentFaction = derived(
  [currentBattle, currentFactionId],
  ([$battle, $factionId]) => $battle?.factions.find((f) => f.id === $factionId) ?? null
)

// ============ 当前选中的军种分支 ============
export const currentBranch = writable<string>('')

// ============ 当前选中的已放置单位ID ============
export const selectedPlacedUnitId = writable<string | null>(null)

// ============ 当前选中的已放置单位(派生) ============
export const selectedPlacedUnit = derived(
  [currentBattle, selectedPlacedUnitId],
  ([$battle, $unitId]) => $battle?.placedUnits.find((u) => u.id === $unitId) ?? null
)

// ============ 撤销栈 ============

interface UndoEntry {
  battleId: string
  snapshot: Omit<Battle, 'actionLog' | 'updatedAt'>
  description: string
  factionId: string | null
  placedUnitId: string | null
}

const _undoStack: UndoEntry[] = []
const MAX_UNDO = 50
export const canUndo = writable(false)

export function pushUndoSnapshot(description: string) {
  const battle = get(currentBattle)
  if (!battle) return
  const { actionLog, updatedAt, ...snapshot } = battle
  _undoStack.push({
    battleId: battle.id,
    snapshot,
    description,
    factionId: get(currentFactionId),
    placedUnitId: get(selectedPlacedUnitId)
  })
  if (_undoStack.length > MAX_UNDO) _undoStack.shift()
  canUndo.set(true)
}

export function undo() {
  const battle = get(currentBattle)
  if (!battle) return
  let idx = _undoStack.length - 1
  while (idx >= 0 && _undoStack[idx].battleId !== battle.id) idx--
  if (idx < 0) return
  const entry = _undoStack.splice(idx, 1)[0]
  canUndo.set(_undoStack.some((e) => e.battleId === battle.id))
  const currentLog = battle.actionLog
  battles.update((list) =>
    list.map((b) => {
      if (b.id !== battle.id) return b
      return {
        ...entry.snapshot,
        actionLog: [
          ...currentLog,
          { id: generateId(), timestamp: Date.now(), message: `↩ 撤销：${entry.description}` }
        ],
        updatedAt: Date.now()
      }
    })
  )
  currentFactionId.set(entry.factionId)
  selectedPlacedUnitId.set(entry.placedUnitId)
}

function updateCurrentBattle(updater: (battle: Battle) => Battle) {
  const id = get(currentBattleId)
  if (!id) return
  battles.update((list) =>
    list.map((b) => {
      if (b.id !== id) return b
      const updated = updater(b)
      updated.updatedAt = Date.now()
      return updated
    })
  )
}

export function updateCurrentBattleSettings(
  updates: Partial<
    Pick<Battle, 'name' | 'startDate' | 'timeScale' | 'pixelsPerKm' | 'iconStyle' | 'eventSettings'>
  >
) {
  updateCurrentBattle((b) => ({ ...b, ...updates }))
}

// ============ 战局 CRUD ============

export function createBattle(
  name: string,
  options: {
    conferenceId: string
    mapCenter?: [number, number]
    mapZoom?: number
    startDate?: string
    timeScale?: number
    pixelsPerKm?: number
    iconStyle?: 'nato' | 'simple'
    eventSettings?: EventSetting[]
    enabledMods?: string[]
    campaignId?: string
  }
): string {
  if (!options.conferenceId.trim()) throw new Error('战局必须属于一个大会')
  const existing = getConferenceBattle(options.conferenceId)
  if (existing) {
    loadBattle(existing.id)
    return existing.id
  }
  const id = generateId()

  // 战役模式：从 campaign ModData 预读地图配置，确保初始地图位置正确
  let mapCenter = options?.mapCenter ?? [35, 105]
  let mapZoom = options?.mapZoom ?? 5
  let pixelsPerKm = options?.pixelsPerKm
  let startDate = options?.startDate
  if (options?.campaignId) {
    const campaignMod = registry.getMod(options.campaignId)
    if (campaignMod?.mapConfig) {
      mapCenter = campaignMod.mapConfig.center
      mapZoom = campaignMod.mapConfig.zoom
      pixelsPerKm = campaignMod.mapConfig.pixelsPerKm ?? pixelsPerKm
      if (campaignMod.mapConfig.startDate) {
        startDate = campaignMod.mapConfig.startDate
      }
    }
  }

  const battle: Battle = {
    id,
    conferenceId: options.conferenceId,
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    mapCenter,
    mapZoom,
    factions: [],
    placedUnits: [],
    fallenUnits: [],
    actionLog: [],
    startDate,
    timeScale: options?.timeScale,
    pixelsPerKm,
    iconStyle: options?.iconStyle,
    eventSettings: options?.eventSettings ?? [],
    enabledMods: options?.enabledMods ?? [],
    campaignId: options?.campaignId
  }
  battles.update((list) => [...list, battle])
  currentBattleId.set(id)
  // 如果是战役模式，自动注入初始数据
  if (options?.campaignId) {
    initializeBattleFromCampaign(id, options.campaignId)
  }

  console.log('Created battle with ID:', battle)
  return id
}

/**
 * 从战役 ModData 初始化战局：创建阵营、单位模板、放置单位、设置地图/设施/事件。
 * 在 createBattle 内部调用，仅在新建战役时执行。
 */
function initializeBattleFromCampaign(battleId: string, campaignId: string): void {
  const campaignMod = registry.getMod(campaignId)
  if (!campaignMod) {
    console.warn('initializeBattleFromCampaign: Campaign mod not found: ' + campaignId)
    return
  }

  // 设置地图配置
  if (campaignMod.mapConfig) {
    battles.update((list) =>
      list.map((b) => {
        if (b.id !== battleId) return b
        return {
          ...b,
          mapCenter: campaignMod.mapConfig!.center,
          mapZoom: campaignMod.mapConfig!.zoom,
          pixelsPerKm: campaignMod.mapConfig!.pixelsPerKm ?? b.pixelsPerKm
        }
      })
    )
  }
  console.log('initializeBattleFromCampaign: Map config set for battle', campaignId, campaignMod.mapConfig)
  // 设置设施
  if (campaignMod.facilities) {
    battles.update((list) =>
      list.map((b) => {
        if (b.id !== battleId) return b
        return { ...b, facilities: campaignMod.facilities }
      })
    )
  }

  // 设置事件
  if (campaignMod.events) {
    const eventStates = campaignMod.events.map((e) => ({
      eventId: e.id,
      triggered: false
    }))
    battles.update((list) =>
      list.map((b) => {
        if (b.id !== battleId) return b
        return { ...b, eventStates }
      })
    )
  }

  // 初始化阵营侦察接触（Phase 3）
  battles.update((list) =>
    list.map((b) => {
      if (b.id !== battleId) return b
      return { ...b, factionContacts: {} }
    })
  )

  // 创建阵营并放置单位
  if (campaignMod.deployments?.factions) {
    for (const factionDeployment of campaignMod.deployments.factions) {
      const factionId = generateId()

      // 创建阵营
      const faction: Faction = {
        id: factionId,
        name: factionDeployment.name,
        color: factionDeployment.color,
        side: factionDeployment.side ?? 'blue',
        flagUrl: factionDeployment.flagUrl,
        units: []
      }

      // 添加单位模板到阵营
      const templateIds = new Set(factionDeployment.initialUnits.map((u) => u.unitTemplateId))
      for (const templateId of templateIds) {
        const template = campaignMod.unitTemplates?.find((t) => t.id === templateId)
        if (template) {
          faction.units.push({ ...template })
        } else {
          console.warn('initializeBattleFromCampaign: Unit template not found: ' + templateId)
        }
      }

      // 写入阵营
      battles.update((list) =>
        list.map((b) => {
          if (b.id !== battleId) return b
          return {
            ...b,
            factions: [...b.factions, faction]
          }
        })
      )

      // 放置初始单位
      for (const placement of factionDeployment.initialUnits) {
        const placedId = generateId()
        const template = faction.units.find((u) => u.id === placement.unitTemplateId)

        const placed: PlacedUnit = {
          id: placedId,
          unitId: placement.unitTemplateId,
          factionId,
          lat: placement.lat,
          lng: placement.lng,
          route: placement.route ?? [],
          strikeRadius: 0,
          status: placement.status ?? 'idle',
          hp: template?.stats.maxHp ?? 100,
          org: template?.stats.maxOrg ?? 100,
          stats: template?.stats
            ? { ...template.stats }
            : {
                maxHp: 100,
                maxOrg: 100,
                softAttack: 20,
                hardAttack: 10,
                airAttack: 5,
                defense: 20,
                speed: 10,
                attackRange: 15,
                hardness: 0.1
              },
          sensorIds: placement.sensorIds ?? template?.sensorIds ? [...(placement.sensorIds ?? template!.sensorIds!)] : undefined,
          behavior: 'aggressive'
        }

        battles.update((list) =>
          list.map((b) => {
            if (b.id !== battleId) return b
            return {
              ...b,
              placedUnits: [...b.placedUnits, placed]
            }
          })
        )

        // 同步写入 runtimePositions
        runtimePositions.update((pos) => ({
          ...pos,
          [placedId]: {
            lat: placed.lat,
            lng: placed.lng,
            route: [...placed.route],
            status: placed.status,
            hp: placed.hp,
            org: placed.org,
            isEngaged: false,
            statusEffects: [],
            sensorIds: placed.sensorIds ? [...placed.sensorIds] : undefined,
            behavior: placed.behavior ?? 'aggressive'
          }
        }))
      }
    }
  }

  // 添加初始化日志
  const battle = getBattleById(battleId)
  if (battle) {
    const factionCount = battle.factions.length
    const unitCount = battle.placedUnits.length
    addLog('战役初始化完成：' + factionCount + ' 个阵营，' + unitCount + ' 个部署单位')
  }
}

export function deleteBattle(id: string) {
  battles.update((list) => list.filter((b) => b.id !== id))
  if (get(currentBattleId) === id) {
    currentBattleId.set(null)
    currentFactionId.set(null)
  }
}

export function renameBattle(id: string, name: string) {
  const trimmed = name.trim()
  if (!trimmed) return
  battles.update((list) =>
    list.map((b) => (b.id === id ? { ...b, name: trimmed, updatedAt: Date.now() } : b))
  )
}

export function loadBattle(id: string) {
  const battle = getBattleById(id) // 确保战局存在
  if (battle) {
    _undoStack.length = 0
    canUndo.set(false)
    currentBattleId.set(id)
    currentFactionId.set(battle.factions[0]?.id ?? null)
  }
}

export function getBattleById(id: string): Battle | null {
  return get(battles).find((b) => b.id === id) ?? null
}

/** 每个大会只有一份军事推演状态。 */
export function getConferenceBattle(conferenceId: string): Battle | null {
  return get(battles).find((battle) => battle.conferenceId === conferenceId) ?? null
}
// ============ 阵营 CRUD ============

export function addFaction(name: string, color: string, side: UnitSide = 'blue'): string {
  pushUndoSnapshot(`添加阵营: ${name}`)
  const id = generateId()
  const faction: Faction = { id, name, color, side, units: [] }
  updateCurrentBattle((b) => ({
    ...b,
    factions: [...b.factions, faction]
  }))
  if (!get(currentFactionId)) {
    currentFactionId.set(id)
  }
  addLog(`添加阵营: ${name}`)
  return id
}

export function removeFaction(factionId: string) {
  const battle = get(currentBattle)
  const faction = battle?.factions.find((f) => f.id === factionId)
  pushUndoSnapshot(`删除阵营: ${faction?.name ?? ''}`)
  updateCurrentBattle((b) => ({
    ...b,
    factions: b.factions.filter((f) => f.id !== factionId),
    placedUnits: b.placedUnits.filter((u) => u.factionId !== factionId)
  }))
  addLog(`删除阵营: ${faction?.name ?? ''}`)
  if (get(currentFactionId) === factionId) {
    const updated = get(currentBattle)
    currentFactionId.set(updated?.factions[0]?.id ?? null)
  }
}

export function updateFaction(
  factionId: string,
  updates: Partial<Pick<Faction, 'name' | 'color' | 'flagUrl' | 'side'>>
) {
  const battle = get(currentBattle)
  const faction = battle?.factions.find((f) => f.id === factionId)
  const oldName = faction?.name ?? ''
  pushUndoSnapshot(`修改阵营信息: ${oldName}`)
  updateCurrentBattle((b) => ({
    ...b,
    factions: b.factions.map((f) => (f.id === factionId ? { ...f, ...updates } : f))
  }))
  if (updates.name && updates.name !== oldName) {
    addLog(`阵营改名: ${oldName} → ${updates.name}`)
  } else {
    addLog(`修改阵营信息: ${oldName}`)
  }
}

export function selectFaction(factionId: string) {
  currentFactionId.update((current) => (current === factionId ? null : factionId))
}

// ============ 单位 CRUD ============

export function addUnit(factionId: string, unit: UnitTemplate) {
  pushUndoSnapshot(`创建单位: ${unit.name}`)
  updateCurrentBattle((b) => ({
    ...b,
    factions: b.factions.map((f) => (f.id === factionId ? { ...f, units: [...f.units, unit] } : f))
  }))
  addLog(
    `${get(currentBattle)?.factions.find((f) => f.id === factionId)?.name ?? ''} 创建单位: ${unit.name}`
  )
}

/** 将已阵亡单位从 placedUnits 移到 fallenUnits */
export function moveToFallen(placedId: string) {
  const battle = get(currentBattle)
  const placed = battle?.placedUnits.find((p) => p.id === placedId)
  if (!battle || !placed) return
  const unit = battle.factions.flatMap((f) => f.units).find((u) => u.id === placed.unitId)
  const unitName = unit?.name ?? placed.unitId
  updateCurrentBattle((b) => ({
    ...b,
    placedUnits: b.placedUnits.filter((p) => p.id !== placedId),
    fallenUnits: [...b.fallenUnits, { ...placed, status: 'destroyed', route: [], attackTargetId: undefined }]
  }))
  // 清理运行时位置
  runtimePositions.update((pos) => {
    const next = { ...pos }
    delete next[placedId]
    return next
  })
  selectedPlacedUnitId.update((id) => (id === placedId ? null : id))
  addLog(`${unitName} 已阵亡`, { category: 'combat', location: { lat: placed.lat, lng: placed.lng }, sourceUnitId: placedId })
}

export function removeUnit(factionId: string, unitId: string) {
  const battle = get(currentBattle)
  const unit = battle?.factions.find((f) => f.id === factionId)?.units.find((u) => u.id === unitId)
  pushUndoSnapshot(`删除单位: ${unit?.name ?? ''}`)
  updateCurrentBattle((b) => ({
    ...b,
    factions: b.factions.map((f) =>
      f.id === factionId ? { ...f, units: f.units.filter((u) => u.id !== unitId) } : f
    ),
    placedUnits: b.placedUnits.filter((p) => p.unitId !== unitId)
  }))
  addLog(`删除单位: ${unit?.name ?? ''}`)
}

export function updateUnit(
  factionId: string,
  unitId: string,
  updater: (unit: UnitTemplate) => UnitTemplate,
  logMessage?: string
) {
  const battle = get(currentBattle)
  const unit = battle?.factions.find((f) => f.id === factionId)?.units.find((u) => u.id === unitId)
  const unitName = unit?.name ?? '未知单位'
  pushUndoSnapshot(`单位组成变更: ${unitName}`)
  updateCurrentBattle((b) => ({
    ...b,
    factions: b.factions.map((f) =>
      f.id === factionId
        ? { ...f, units: f.units.map((u) => (u.id === unitId ? updater(u) : u)) }
        : f
    )
  }))
  addLog(logMessage ?? `单位组成变更: ${unitName}`)
}

// ============ 放置单位 ============

export function placeUnit(unitId: string, factionId: string, lat: number, lng: number): string {
  const battle = get(currentBattle)
  const unit = battle?.factions.find((f) => f.id === factionId)?.units.find((u) => u.id === unitId)
  pushUndoSnapshot(`放置单位: ${unit?.name ?? ''}`)
  const id = generateId()

  // 根据单位组成派生攻击射程（km）

  const placed: PlacedUnit = {
    id,
    unitId,
    factionId,
    lat,
    lng,
    route: [],
    strikeRadius: 0,
    status: 'idle',
    hp: unit?.stats.maxHp ?? 100,
    org: unit?.stats.maxOrg ?? 100,
    stats: unit?.stats
      ? { ...unit.stats }
      : {
          maxHp: 100,
          maxOrg: 100,
          softAttack: 20,
          hardAttack: 10,
          airAttack: 5,
          defense: 20,
          speed: 10,
          attackRange: 15,
          hardness: 0.1
        },
    sensorIds: unit?.sensorIds ? [...unit.sensorIds] : undefined,
    behavior: 'aggressive'
  }
  updateCurrentBattle((b) => ({
    ...b,
    placedUnits: [...b.placedUnits, placed]
  }))
  // 同步写入 runtimePositions，使引擎立即感知到新单位（无需等待下次 initRuntimePositions）
  runtimePositions.update((pos) => ({
    ...pos,
    [id]: {
      lat,
      lng,
      route: [],
      status: 'idle',
      hp: placed.hp,
      org: placed.org,
      isEngaged: false,
      statusEffects: [],
      sensorIds: unit?.sensorIds ? [...unit.sensorIds] : undefined,
      behavior: 'aggressive'
    }
  }))
  addLog(`在 (${lat.toFixed(3)}, ${lng.toFixed(3)}) 放置单位`)
  return id
}

export function removePlacedUnit(placedId: string) {
  const battle = get(currentBattle)
  const placed = battle?.placedUnits.find((u) => u.id === placedId)
  const unitName = placed
    ? (battle?.factions.flatMap((f) => f.units).find((u) => u.id === placed.unitId)?.name ?? '')
    : ''
  pushUndoSnapshot(`撒除单位: ${unitName}`)
  updateCurrentBattle((b) => ({
    ...b,
    placedUnits: b.placedUnits.filter((u) => u.id !== placedId)
  }))
  runtimePositions.update((pos) => {
    const next = { ...pos }
    delete next[placedId]
    return next
  })
  addLog(`从地图撒除单位: ${unitName}`)
  if (get(selectedPlacedUnitId) === placedId) {
    selectedPlacedUnitId.set(null)
  }
}

export function updatePlacedUnit(
  placedId: string,
  updates: Partial<Omit<PlacedUnit, 'id'>>,
  undoDescription?: string
) {
  if (undoDescription) pushUndoSnapshot(undoDescription)
  updateCurrentBattle((b) => ({
    ...b,
    placedUnits: b.placedUnits.map((u) => (u.id === placedId ? { ...u, ...updates } : u))
  }))
}

export function addRoutePoint(placedId: string, lat: number, lng: number) {
  pushUndoSnapshot('添加路线节点')
  const battle = get(currentBattle)
  const unit = battle?.placedUnits.find((u) => u.id === placedId)
  if (!unit) return
  const newRoute: [number, number][] = [...unit.route, [lat, lng]]
  updatePlacedUnit(placedId, { route: newRoute })
  // 将新路线同步写入 runtimePositions，使引擎在推演运行期间也能接收到路线更新
  runtimePositions.update((pos) => {
    if (!pos[placedId]) return pos
    return { ...pos, [placedId]: { ...pos[placedId], route: newRoute } }
  })
}

export function updateRoutePoint(placedId: string, index: number, lat: number, lng: number) {
	pushUndoSnapshot('移动路线节点')
	const battle = get(currentBattle)
	const unit = battle?.placedUnits.find((u) => u.id === placedId)
	if (!unit || index < 0 || index >= unit.route.length) return
	const newRoute: [number, number][] = unit.route.map((p, i) =>
		i === index ? [lat, lng] : p
	)
	updatePlacedUnit(placedId, { route: newRoute })
	runtimePositions.update((pos) => {
		if (!pos[placedId]) return pos
		return { ...pos, [placedId]: { ...pos[placedId], route: newRoute } }
	})
}

export function insertRoutePoint(placedId: string, index: number, lat: number, lng: number) {
	pushUndoSnapshot('插入路线节点')
	const battle = get(currentBattle)
	const unit = battle?.placedUnits.find((u) => u.id === placedId)
	if (!unit || index < 0 || index > unit.route.length) return
	const newRoute: [number, number][] = [
		...unit.route.slice(0, index),
		[lat, lng],
		...unit.route.slice(index)
	]
	updatePlacedUnit(placedId, { route: newRoute })
	runtimePositions.update((pos) => {
		if (!pos[placedId]) return pos
		return { ...pos, [placedId]: { ...pos[placedId], route: newRoute } }
	})
}

export function removeRoutePoint(placedId: string, index: number) {
	pushUndoSnapshot('删除路线节点')
	const battle = get(currentBattle)
	const unit = battle?.placedUnits.find((u) => u.id === placedId)
	if (!unit || index < 0 || index >= unit.route.length) return
	const newRoute: [number, number][] = unit.route.filter((_, i) => i !== index)
	updatePlacedUnit(placedId, { route: newRoute })
	runtimePositions.update((pos) => {
		if (!pos[placedId]) return pos
		return { ...pos, [placedId]: { ...pos[placedId], route: newRoute } }
	})
}

export function clearRoute(placedId: string) {
  const battle = get(currentBattle)
  const placed = battle?.placedUnits.find((u) => u.id === placedId)
  const unitName = placed
    ? (battle?.factions.flatMap((f) => f.units).find((u) => u.id === placed.unitId)?.name ?? '')
    : ''
  pushUndoSnapshot(`清除路线: ${unitName}`)
  updatePlacedUnit(placedId, { route: [] })
  // 将清除同步到 runtimePositions
  runtimePositions.update((pos) => {
    if (!pos[placedId]) return pos
    return { ...pos, [placedId]: { ...pos[placedId], route: [] } }
  })
  addLog(`清除路线: ${unitName}`)
}

// ============ 行动日志 ============

export function addLog(
  message: string,
  opts?: {
    category?: MessageCategory;
    location?: { lat: number; lng: number };
    sourceUnitId?: string;
    targetUnitId?: string;
  }
) {
  const entry: ActionLogEntry = {
    id: generateId(),
    timestamp: Date.now(),
    message,
    ...opts
  }
  updateCurrentBattle((b) => ({
    ...b,
    actionLog: [...b.actionLog, entry]
  }))
}

export function clearLog() {
  updateCurrentBattle((b) => ({
    ...b,
    actionLog: []
  }))
}

// ============ 重置当前战局 ============

export function resetCurrentBattle() {
  updateCurrentBattle((b) => ({
    ...b,
    factions: [],
    placedUnits: [],
    fallenUnits: [],
    actionLog: [],
    updatedAt: Date.now()
  }))
  currentFactionId.set(null)
  selectedPlacedUnitId.set(null)
}

/** 清除所有战局数据（localStorage + 文件同步清理） */
export async function clearAllBattles(): Promise<void> {
  battles.set([])
  currentBattleId.set(null)
  currentFactionId.set(null)
  selectedPlacedUnitId.set(null)
  await deleteFromStore(STORE_DOMAIN)
}

/**
 * 从 JSON 导入一个或多个战局。
 * - 已存在相同 id 的战局：跳过（不覆盖）
 * - 否则追加到列表末尾
 * 返回 [导入数量, 跳过数量]
 */
export function importBattles(data: unknown): [number, number] {
  const list: Battle[] = Array.isArray(data) ? data : [data]
  const existing = get(battles)
  const existingIds = new Set(existing.map((b) => b.id))
  let imported = 0
  let skipped = 0
  const toAdd: Battle[] = []
  for (const item of list) {
    if (
      typeof item !== 'object' ||
      item === null ||
      typeof (item as Battle).id !== 'string' ||
      typeof (item as Battle).name !== 'string'
    ) {
      skipped++
      continue
    }
    if (existingIds.has((item as Battle).id)) {
      skipped++
    } else {
      toAdd.push(item as Battle)
      imported++
    }
  }
  if (toAdd.length > 0) {
    battles.update((list) => [...list, ...toAdd])
    // save is handled by the debounced subscribe; trigger immediate flush for import
    saveBattlesNow()
  }
  return [imported, skipped]
}

// ============ 设施 CRUD ============

export function addFacility(facility: import('$lib/classes/types/battle').Facility): void {
  pushUndoSnapshot(`添加设施: ${facility.name}`)
  updateCurrentBattle((b) => ({
    ...b,
    facilities: [...(b.facilities ?? []), facility]
  }))
  addLog(`添加设施: ${facility.name}`)
}

export function removeFacility(facilityId: string): void {
  const battle = get(currentBattle)
  const facility = battle?.facilities?.find((f) => f.id === facilityId)
  pushUndoSnapshot(`删除设施: ${facility?.name ?? ''}`)
  updateCurrentBattle((b) => ({
    ...b,
    facilities: (b.facilities ?? []).filter((f) => f.id !== facilityId)
  }))
  addLog(`删除设施: ${facility?.name ?? ''}`)
}

export function updateFacility(facilityId: string, updates: Partial<import('$lib/classes/types/battle').Facility>): void {
  const battle = get(currentBattle)
  const facility = battle?.facilities?.find((f) => f.id === facilityId)
  pushUndoSnapshot(`更新设施: ${facility?.name ?? ''}`)
  updateCurrentBattle((b) => ({
    ...b,
    facilities: (b.facilities ?? []).map((f) =>
      f.id === facilityId ? { ...f, ...updates } : f
    )
  }))
}

// ============ 状态效果 API（Phase 4） ============

/** 获取当前模拟时间戳（ms） */
function getSimTimeMs(): number {
  return get(gameClock).currentDate.getTime()
}

/**
 * 向指定单位施加状态效果。
 * 同时写入 PlacedUnit 和 RuntimeUnitPosition。
 */
export function applyStatusEffectToUnit(
  placedUnitId: string,
  statusId: string,
  customDuration?: number,
  source?: string
): void {
  const simTimeMs = getSimTimeMs()
  pushUndoSnapshot(`施加状态: ${statusId}`)

  updateCurrentBattle((b) => ({
    ...b,
    placedUnits: b.placedUnits.map((u) => {
      if (u.id !== placedUnitId) return u
      return {
        ...u,
        statusEffects: applyStatusEffect(u.statusEffects, statusId, simTimeMs, customDuration, source)
      }
    })
  }))

  // 同步写入 runtimePositions
  runtimePositions.update((pos) => {
    const cur = pos[placedUnitId]
    if (!cur) return pos
    return {
      ...pos,
      [placedUnitId]: {
        ...cur,
        statusEffects: applyStatusEffect(cur.statusEffects, statusId, simTimeMs, customDuration, source)
      }
    }
  })

  addLog(`施加状态效果: ${statusId} → 单位 ${placedUnitId}`)
}

/**
 * 从指定单位移除状态效果。
 */
export function removeStatusEffectFromUnit(placedUnitId: string, statusId: string): void {
  pushUndoSnapshot(`移除状态: ${statusId}`)

  updateCurrentBattle((b) => ({
    ...b,
    placedUnits: b.placedUnits.map((u) => {
      if (u.id !== placedUnitId) return u
      return {
        ...u,
        statusEffects: removeStatusEffect(u.statusEffects, statusId)
      }
    })
  }))

  runtimePositions.update((pos) => {
    const cur = pos[placedUnitId]
    if (!cur) return pos
    return {
      ...pos,
      [placedUnitId]: {
        ...cur,
        statusEffects: removeStatusEffect(cur.statusEffects, statusId)
      }
    }
  })

  addLog(`移除状态效果: ${statusId} ← 单位 ${placedUnitId}`)
}

/**
 * 查询单位是否具有指定状态效果。
 */
export function unitHasStatusEffect(placedUnitId: string, statusId: string): boolean {
  const battle = get(currentBattle)
  const placed = battle?.placedUnits.find((u) => u.id === placedUnitId)
  return hasStatusEffect(placed?.statusEffects, statusId)
}

// ============ 侦察接触 API（Phase 3） ============

/**
 * 获取当前选中阵营的所有侦察接触。
 * 如果没有选中阵营则返回空数组。
 */
export function getCurrentFactionContacts(): import('$lib/classes/types/battle').Contact[] {
  const battle = get(currentBattle)
  const factionId = get(currentFactionId)
  if (!battle || !factionId) return []
  return getContactsForFaction(battle.factionContacts, factionId)
}

/**
 * 查询某敌方单位是否已被当前阵营确认（即已完全识别）。
 */
export function isEnemyUnitConfirmed(placedUnitId: string): boolean {
  const battle = get(currentBattle)
  const factionId = get(currentFactionId)
  if (!battle || !factionId) return false
  return isUnitConfirmed(battle.factionContacts, factionId, placedUnitId)
}

// ============ 交互模式 ============

export type InteractionMode = 'select' | 'place' | 'route' | 'strike' | 'measure' | 'attack'
export const interactionMode = writable<InteractionMode>('select')

/** 自动索敌开关（Phase 9，关闭后单位不自动攻击） */
export const autoAttackEnabled = writable(true)

/** 待放置的单位ID (place模式使用) */
export const pendingPlaceUnitId = writable<string | null>(null)

// ============ 运行时位置（60fps 更新，不写 battles，不触发 localStorage） ============

export interface RuntimeUnitPosition {
  lat: number
  lng: number
  route: [number, number][]
  status: PlacedUnit['status']
  /** 当前生命值（高频更新，不触发 localStorage） */
  hp: number
  /** 当前组织度（高频更新，不触发 localStorage） */
  org: number
  /** 是否正在交战（由引擎战斗结算更新） */
  isEngaged: boolean
  /** 激活的状态效果列表（Phase 4） */
  statusEffects?: import('$lib/classes/types/battle').StatusInstance[]
  /** 该单位装备的传感器 ID 列表（Phase 3） */
  sensorIds?: string[]
  /** 行为姿态（Phase 5），默认 'aggressive' */
  behavior?: import('$lib/classes/types/battle').UnitBehavior
}

/**
 * 运行时位置 store：仅在内存中存储当前战局各 PlacedUnit 的实时位置。
 * 由引擎 tick 驱动（60fps），不触发 battles/localStorage 写入。
 * 地图组件监听此 store，用 setLatLng() 快速更新 Marker，避免重建 DOM。
 */
export const runtimePositions = writable<Record<string, RuntimeUnitPosition>>({})

/**
 * 初始化运行时位置（引擎启动时调用）。
 * 将当前 battle 的 placedUnits 位置快照写入 runtimePositions。
 */
export function initRuntimePositions() {
  const battle = get(currentBattle)
  if (!battle) return
  const snapshot: Record<string, RuntimeUnitPosition> = {}
  for (const u of battle.placedUnits) {
    snapshot[u.id] = {
      lat: u.lat,
      lng: u.lng,
      route: [...u.route],
      status: u.status,
      hp: u.hp,
      org: u.org,
      isEngaged: false,
      statusEffects: u.statusEffects ? [...u.statusEffects] : undefined,
      sensorIds: u.sensorIds ? [...u.sensorIds] : undefined,
      behavior: u.behavior ?? 'aggressive'
    }
  }
  runtimePositions.set(snapshot)
}

/**
 * 将运行时位置写回 battles store（引擎停止/暂停时调用）。
 * 这样位置才会持久化到 localStorage。
 */
export function flushRuntimePositions() {
  const positions = get(runtimePositions)
  const id = get(currentBattleId)
  if (!id) return
  const clock = get(gameClock)
  battles.update((list) =>
    list.map((b) => {
      if (b.id !== id) return b
      return {
        ...b,
        simulatedDate: clock.currentDate.toISOString(),
        timeScale: clock.timeScale,
        placedUnits: b.placedUnits.map((u) => {
          const pos = positions[u.id]
          return pos
            ? {
                ...u,
                lat: pos.lat,
                lng: pos.lng,
                route: pos.route,
                status: pos.status,
                hp: pos.hp,
                org: pos.org,
                statusEffects: pos.statusEffects,
                sensorIds: pos.sensorIds,
                behavior: pos.behavior
              }
            : u
        })
      }
    })
  )
}

/**
 * 按模拟时间步长推进当前战局中所有有路线的 PlacedUnit。
 * 仅写 runtimePositions（不触发 battles/localStorage），地图通过快速路径 setLatLng 响应。
 *
 * 使用近似平面地球公式：
 *   1° 纬度 ≈ 111 km
 *   1° 经度 ≈ 111 × cos(lat) km
 */
export function tickMapMovement(deltaSimSec: number) {
  runtimePositions.update((positions) => {
    const next: Record<string, RuntimeUnitPosition> = {}
    for (const [id, cur] of Object.entries(positions)) {
      // 阵亡单位：维持状态，不移动
      if (cur.status === 'destroyed' || cur.hp <= 0) {
        next[id] =
          cur.status === 'destroyed'
            ? cur
            : { ...cur, status: 'destroyed', route: [], isEngaged: false }
        continue
      }

      if (cur.route.length === 0) {
        const ns = resolveStatus({
          hp: cur.hp, isEngaged: cur.isEngaged, routeLength: 0,
          behavior: cur.behavior ?? 'aggressive',
          hasRouted: hasStatusEffect(cur.statusEffects, 'routed')
        }, cur.status)
        next[id] = ns === cur.status ? cur : { ...cur, status: ns }
        continue
      }

      // Phase 5：找到对应 PlacedUnit，读取行为姿态和有效速度
      const battle = get(currentBattle)
      const placed = battle?.placedUnits.find((p) => p.id === id)
      const behavior = cur.behavior ?? placed?.behavior ?? 'aggressive'

      // Phase 5：defensive / hold 不移动
      if (behavior === 'defensive' || behavior === 'hold') {
        const cleared = cur.route.length > 0 ? [] : cur.route
        const ns = resolveStatus({
          hp: cur.hp, isEngaged: cur.isEngaged, routeLength: 0,
          behavior,
          hasRouted: hasStatusEffect(cur.statusEffects, 'routed')
        }, cur.status)
        next[id] = (cleared === cur.route && ns === cur.status) ? cur : { ...cur, route: cleared, status: ns }
        continue
      }

      // Phase 5：正在交战的 aggressive/cautious 单位停止移动
      if (cur.isEngaged && (behavior === 'aggressive' || behavior === 'cautious')) {
        const ns = resolveStatus({
          hp: cur.hp, isEngaged: true, routeLength: cur.route.length,
          behavior,
          hasRouted: hasStatusEffect(cur.statusEffects, 'routed')
        }, cur.status)
        next[id] = ns === cur.status ? cur : { ...cur, status: ns }
        continue
      }

      // Phase 5：溃退单位自动生成远离敌人的撤退路线
      let route = cur.route as [number, number][]
      if (cur.status === 'retreating' && route.length === 0) {
        // 找到最近的敌方单位
        let nearestEnemyDist = Infinity
        let nearestEnemyLat = cur.lat
        let nearestEnemyLng = cur.lng
        for (const [otherId, otherPos] of Object.entries(positions)) {
          if (otherId === id) continue
          const otherPlaced = battle?.placedUnits.find((p) => p.id === otherId)
          if (!otherPlaced || otherPlaced.factionId === placed?.factionId) continue
          const dLat = (otherPos.lat - cur.lat) * 111
          const dLng = (otherPos.lng - cur.lng) * 111 * Math.cos((cur.lat * Math.PI) / 180)
          const dist = Math.sqrt(dLat * dLat + dLng * dLng)
          if (dist < nearestEnemyDist) {
            nearestEnemyDist = dist
            nearestEnemyLat = otherPos.lat
            nearestEnemyLng = otherPos.lng
          }
        }
        // 撤退方向 = 远离最近敌人，距离 = 10 km
        const retreatDistKm = 10
        const dx = cur.lat - nearestEnemyLat
        const dy = cur.lng - nearestEnemyLng
        const norm = Math.sqrt(dx * dx + dy * dy)
        if (norm > 1e-9) {
          const retreatLat = cur.lat + (dx / norm) * (retreatDistKm / 111)
          const retreatLng = cur.lng + (dy / norm) * (retreatDistKm / (111 * Math.cos((cur.lat * Math.PI) / 180)))
          route = [[retreatLat, retreatLng]]
        }
      }

      // Phase 5：使用状态修正后的有效速度
      const effectiveStats = getEffectiveStats(placed?.stats ?? {}, cur.statusEffects)
      const speed = effectiveStats.speed ?? placed?.stats.speed ?? 10

      let remainKm = (speed / 3600) * deltaSimSec
      let lat = cur.lat
      let lng = cur.lng

      while (remainKm > 1e-9 && route.length > 0) {
        const [tLat, tLng] = route[0]
        const dLatKm = (tLat - lat) * 111
        const dLngKm = (tLng - lng) * 111 * Math.cos((lat * Math.PI) / 180)
        const distKm = Math.sqrt(dLatKm * dLatKm + dLngKm * dLngKm)

        if (distKm < 1e-9) {
          route = route.slice(1)
          continue
        }

        if (remainKm >= distKm) {
          lat = tLat
          lng = tLng
          route = route.slice(1)
          remainKm -= distKm
        } else {
          const ratio = remainKm / distKm
          lat += (dLatKm / 111) * ratio
          const cosLat = Math.cos((lat * Math.PI) / 180)
          lng += cosLat > 1e-9 ? (dLngKm / (111 * cosLat)) * ratio : 0
          remainKm = 0
        }
      }

      const ns = resolveStatus({
        hp: cur.hp, isEngaged: cur.isEngaged, routeLength: route.length,
        behavior: behavior ?? cur.behavior ?? 'aggressive',
        hasRouted: hasStatusEffect(cur.statusEffects, 'routed')
      }, cur.status)
      next[id] = (lat === cur.lat && lng === cur.lng && route === cur.route && ns === cur.status)
        ? cur : { ...cur, lat, lng, route, status: ns }
    }
    return next
  })
}
