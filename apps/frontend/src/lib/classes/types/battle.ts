// ============ 注册表类型 & 单例（再导出供其他模块使用） ============
export { registry, mods } from '$lib/classes/services/plugin/mod-registry.svelte'

// ============ 阵营立场 ============

/**
 * 阵营立场（决定北约图标框架颜色）。
 * 开放字符串：内置值为 'blue' | 'red' | 'neutral'，Mod 可自定义新立场。
 */
export type UnitSide = string

// ============ 战役相关类型 ============

/** 战役地图配置 */
export interface CampaignMapConfig {
  center: [number, number]
  zoom: number
  pixelsPerKm?: number
  /** 战役起始日期（ISO 格式 YYYY-MM-DD） */
  startDate?: string
}

/** 战役初始部署 */
export interface CampaignDeployment {
  factions: CampaignFactionDeployment[]
}

export interface CampaignFactionDeployment {
  name: string
  color: string
  side: UnitSide
  flagUrl?: string
  initialUnits: CampaignUnitPlacement[]
}

export interface CampaignUnitPlacement {
  unitTemplateId: string
  name?: string
  lat: number
  lng: number
  route?: [number, number][]
  status?: string
  /** 该单位装备的传感器 ID 列表（Phase 3） */
  sensorIds?: string[]
}

/** 设施类型 */
export type FacilityType =
  | 'fortress'
  | 'trench_network'
  | 'supply_depot'
  | 'railway_hub'
  | 'airfield'
  | 'artillery_position'
  | 'command_post'
  | 'hospital'

/** 设施 */
export interface Facility {
  id: string
  type: FacilityType
  name: string
  lat: number
  lng: number
  factionId?: string
  properties: Record<string, number>
  maxCapacity?: number
}

// ============ 状态系统（Phase 4） ============

/** 状态效果定义（可在 Mod 中注册） */
export interface StatusDefinition {
  id: string
  name: string
  description?: string
  /** 属性乘数（1.0 = 不变，如 { defense: 2.0, speed: 0 } 表示防御翻倍、速度归零） */
  modifiers?: Record<string, number>
  /** 默认持续时间（模拟秒，undefined = 永久直到被移除） */
  defaultDuration?: number
  /** 互斥类别（同类别只保留最高优先级） */
  category?: 'posture' | 'condition' | 'ability'
  /** 优先级（同类别中数值越高越优先） */
  priority?: number
  /** 行为标签 */
  tags?: string[]
}

/** 单位身上激活的状态效果实例 */
export interface StatusInstance {
  statusId: string
  /** 生效时的模拟时间戳（ms epoch） */
  appliedAt: number
  /** 持续时间（模拟秒，undefined = 永久） */
  duration?: number
  /** 来源标识（eventId、"combat"、"command" 等） */
  source?: string
}

/** 单位行为姿态（Phase 5） */
export type UnitBehavior = 'aggressive' | 'defensive' | 'cautious' | 'hold'

/** 传感器类型（Phase 3 使用） */
export type SensorType = 'visual' | 'sigint' | 'passive_acoustic'

/** 传感器定义（Phase 3 使用） */
export interface SensorDefinition {
  id: string
  type: SensorType
  properties: Record<string, number | boolean | string>
}

/** 单位方向信号特征（Phase 3 使用） */
export interface UnitSignatures {
  visual?: { front: number; side: number; rear: number; top: number }
  acoustic?: { front: number; side: number; rear: number; top: number }
}

/** 接触/侦察标记（Phase 3 使用） */
export interface Contact {
  id: string
  position: { lat: number; lng: number }
  uncertaintyRadius: number
  identityLevel: 'activity' | 'estimated_size' | 'confirmed'
  estimatedType?: string
  confirmedUnitId?: string
  lastUpdated: number
}

/** 战役事件（Phase 6 使用） */
export type EventTriggerType =
  'date' | 'unit_destroyed' | 'unit_enters_zone' | 'facility_captured' | 'variable'

export type EventConditionType =
  'faction_alive' | 'unit_count' | 'random' | 'facility_held' | 'variable_compare'

export type EventActionType =
  | 'spawn_unit'
  | 'send_message'
  | 'apply_status'
  | 'modify_stats'
  | 'change_faction_attitude'
  | 'activate_event'
  | 'set_variable'

export interface CampaignEvent {
  id: string
  name: string
  repeatable: boolean
  cooldown?: number
  trigger: { type: EventTriggerType; params: Record<string, unknown> }
  conditions: Array<{ type: EventConditionType; params: Record<string, unknown> }>
  actions: Array<{ type: EventActionType; params: Record<string, unknown> }>
}

export interface CampaignEventState {
  eventId: string
  triggered: boolean
  lastTriggerTime?: number
}

// ============ 地图上放置的单位 ============

export interface PlacedUnit {
  id: string
  /** 引用 Faction.units 中某个 UnitTemplate 的 id */
  unitId: string
  factionId: string
  lat: number
  lng: number
  /** 行动路线坐标点 */
  route: [number, number][]
  /** 打击目标坐标 */
  strikeTarget?: { lat: number; lng: number }
  /** 打击范围半径（米） */
  strikeRadius: number
  /**
   * 单位状态（开放字符串，Mod 可自定义新状态，如"跃迁"）。
   * 内置值：'idle' | 'moving' | 'attacking' | 'defending' | 'retreating' | 'destroyed'
   */
  status: string
  /** 当前单位行为姿态。 */
  behavior?: UnitBehavior
  /**
   * 可选覆盖：覆盖从模板/大类推导的北约符号功能代码（7 字符：维度 + 功能ID）。
   * 示例："GUCI---" 表示地面步兵。
   */
  natoCode?: string
  /** 激活的状态效果列表（Phase 4） */
  statusEffects?: StatusInstance[]
  /** 该单位装备的传感器 ID 列表（Phase 3，覆盖模板默认值） */
  sensorIds?: string[]
  /** 手动指定的攻击目标单位 ID（Phase 9） */
  attackTargetId?: string
  /** 当前生命值（运行时状态，耗尽则单位被摧毁） */
  hp: number
  /** 当前组织度（运行时状态，耗尽则单位溃退） */
  org: number
  /**
   * 运行时战斗属性（从 UnitTemplate.stats 初始化，运行时可因战损/Mod 偏离）。
   * 灵活字典：内置键 maxHp/maxOrg/softAttack/hardAttack/airAttack/defense/speed/attackRange/hardness，
   * Mod 可添加任意属性键（如 shield、fuel、psi_energy）。
   * 伤害公式：effectiveDmg = softAttack × (1 - hardness) + hardAttack × hardness
   */
  stats: FlexStats
}

// ============ 势力 ============

export interface Faction {
  id: string
  name: string
  color: string
  /** 阵营立场（决定北约图标框架颜色） */
  side: UnitSide
  /** 国旗 URL（可选） */
  flagUrl?: string
  /** 该势力拥有的单位模板列表（可来自全局注册表或自定义） */
  units: UnitTemplate[]
}

// ============ 突发事件配置 ============

export interface EventSetting {
  id: string
  label: string
  enabled: boolean
  /** 触发概率 0-100 */
  probability: number
}

// ============ 战局 ============

export interface Battle {
  id: string
  /** 所属大会；旧版独立战局没有此字段，不自动归入任何大会。 */
  conferenceId?: string
  name: string
  createdAt: number
  updatedAt: number
  /** 地图中心 */
  mapCenter: [number, number]
  mapZoom: number
  factions: Faction[]
  placedUnits: PlacedUnit[]
  /** 已阵亡单位 */
  fallenUnits: PlacedUnit[]
  /** 行动日志 */
  actionLog: ActionLogEntry[]
  /** 推演起始日期（ISO 日期字符串 YYYY-MM-DD） */
  startDate?: string
  /** 最近保存的模拟时刻，重新进入时暂停恢复。 */
  simulatedDate?: string
  /** 时间流速倍率（模拟秒/真实秒） */
  timeScale?: number
  /** 地图比例尺（像素/千米） */
  pixelsPerKm?: number
  /** 图标风格 */
  iconStyle?: 'nato' | 'simple'
  /** 突发事件配置列表 */
  eventSettings?: EventSetting[]
  /** 此战局启用的 Mod ID 列表，按加载顺序排列（越靠后优先级越高） */
  enabledMods?: string[]
  /** 关联的战役 Mod ID */
  campaignId?: string
  /** 设施列表（Phase 2 使用） */
  facilities?: Facility[]
  /** 各阵营的侦察接触列表（Phase 3 使用） */
  factionContacts?: Record<string, Contact[]>
  /** 战争迷雾开关（Phase 3，默认 false = 上帝视角全可见） */
  fogOfWar?: boolean
  /** 战役事件状态（Phase 6 使用） */
  eventStates?: CampaignEventState[]
}

/** 消息类别（Phase 9） */
export type MessageCategory = 'combat' | 'movement' | 'system' | 'event'

export interface ActionLogEntry {
  id: string
  timestamp: number
  message: string
  /** 消息类别（Phase 9，默认 'system'） */
  category?: MessageCategory
  /** 地图气泡位置（Phase 9） */
  location?: { lat: number; lng: number }
  /** 来源单位 ID（Phase 9） */
  sourceUnitId?: string
  /** 目标单位 ID（Phase 9） */
  targetUnitId?: string
  /** 是否已读（Phase 9，UI 标记用） */
  read?: boolean
}

// ============ 动态注册表类型定义 ============
// 所有硬编码的 Branch/Category/UnitType 枚举均已废除，统一用 string ID。

/**
 * 灵活战斗属性字典。
 * 内置键：maxHp, maxOrg, softAttack, hardAttack, airAttack, defense, speed, attackRange, hardness
 * Mod 可自由添加新属性键（如 shield, fuel, psi_energy 等）。
 */
export type FlexStats = Record<string, number>

/**
 * 单位编成组件条目。
 * type / quality 均为字符串 ID，由注册表的 i18n 提供显示文本。
 */
export interface ComponentEntry {
  id: string
  /** 子类型 ID（如 "light"、"main_tank"，由 Mod 定义） */
  type: string
  /** 装备质量 ID（如 "standard"、"gen4plus"，由 Mod 定义） */
  quality: string
  count: number
}

/**
 * 单位大类中某个组件分组的类型/质量配置。
 * 用于 UI 动态渲染创建单位的下拉菜单，无需硬编码。
 */
export interface ComponentTypeGroup {
  /** 组件分组键名，与 UnitTemplate.components 中的键一致（如 "infantry"、"missiles"） */
  key: string
  /** 可选类型 ID 列表（如 ["light", "mechanized", "airborne", "marine"]） */
  types: string[]
  /** 可选质量 ID 列表（如 ["basic", "standard", "advanced", "elite"]） */
  qualities: string[]
  /** 新建时的默认数量 */
  defaultCount: number
}

/** 军种定义 */
export interface BranchDefinition {
  id: string
  /** 可选：北约符号框类型（保留扩展） */
  natoFrame?: string
}

/**
 * 单位大类定义（如陆军步兵、海军水面舰艇）。
 * 通过 branchId 挂载到对应军种，可携带北约 SIDC 代码和组件类型配置。
 */
export interface CategoryDefinition {
  id: string
  /** 所属军种 ID */
  branchId: string
  /**
   * 北约 SIDC 功能代码（维度字符 + 6 位功能 ID，共 7 字符）。
   * 示例：陆军步兵 "GUCI---"，海军水面 "SC-----"，航空 "AMF----"
   * UnitTemplate.natoCode 可覆盖此值。
   */
  natoCode?: string
  /** 组件分组配置（UI 渲染单位创建表单时使用） */
  componentGroups?: ComponentTypeGroup[]
}

/**
 * 单位模板（注册到 ModRegistry，Faction.units 中存储的就是此类型）。
 * 替代原先硬编码的 ArmyUnit / NavyUnit / AirForceUnit 三叉结构。
 */
export interface UnitTemplate {
  id: string
  name: string
  /** 所属军种 ID */
  branchId: string
  /** 所属大类 ID */
  categoryId: string
  /**
   * 北约 SIDC 功能代码（覆盖 CategoryDefinition.natoCode）。
   * 格式：维度(1) + 功能ID(6) = 7 字符，如 "GUCI---"。
   */
  natoCode?: string
  /**
   * 能力标签（引擎逻辑 & 规则判断用）。
   * 示例：["can_strike"] 表示可设置打击目标。
   * Mod 可自由添加新标签。
   */
  tags?: string[]
  /** 战斗属性字典（Mod 可添加任意数值键） */
  stats: FlexStats
  /**
   * 编成组件分组（key 为分组名，如 "infantry"、"armor"、"missiles"）。
   * 替代原先的 infantry[]、armor[]、missiles[] 固定字段。
   */
  components?: Record<string, ComponentEntry[]>
  /** 该模板默认装备的传感器 ID 列表（Phase 3） */
  sensorIds?: string[]
  /** 单位方向信号特征（影响被探测概率，Phase 3） */
  signatures?: import('$lib/classes/types/battle').UnitSignatures
}

/** Mod 战斗公式覆盖（均为可选，未提供则使用引擎默认值） */
export interface ModCombatOverrides {
  /** HP 伤害分配比例（0-1），默认 0.7 */
  hpDamageRatio?: number
  /** Org 伤害分配比例（0-1），默认 0.3 */
  orgDamageRatio?: number
  /** 防御减伤系数，默认 0.5 */
  defenseCoeff?: number
  /** 组织度惩罚阈值（低于此比例时开始衰减），默认 0.2 */
  orgPenaltyThreshold?: number
  /** 战斗结算间隔（真实毫秒），默认 500 */
  combatIntervalMs?: number
}

export interface ModMetadata {
  id: string
  name?: string
  version?: string
  author?: string
  description?: string
  type?: ModData['type']
  source: 'system' | 'user'
}

/**
 * Mod 注入数据包。
 * 基础游戏通过 registry.inject(baseData) 加载；
 * 用户 Mod 也使用完全相同的接口，后注入的数据会覆盖先前已有条目。
 *
 * @example
 * // 注入"星际文明"军种
 * registry.inject({
 *   id: 'stellar-civ',
 *   branches: [{ id: 'stellar_force' }],
 *   categories: [{ id: 'stellar_force.vanguard', branchId: 'stellar_force', natoCode: 'AFM----' }],
 *   i18n: {
 *     'branch.stellar_force': '星际军',
 *     'status.moving': '跃迁',   // 覆盖基础游戏的"行军"
 *   }
 * });
 */
export interface ModData {
  /** Mod 唯一标识符（防止重复加载）。建议格式：'author.mod-name' */
  id?: string
  metadata?: ModMetadata
  /**
   * Mod 类型。
   * - faction / campaign：需由战局显式激活才加载
   * - utility / dependency：注入时立即激活
   * - preset：会议席位预设插件
   */
  type?: 'faction' | 'campaign' | 'utility' | 'dependency' | 'preset'
  dependencies?: string[]
  conflicts?: string[]
  /** 新增军种定义（后注入可覆盖同 id 的条目） */
  branches?: BranchDefinition[]
  /** 新增单位大类定义 */
  categories?: CategoryDefinition[]
  /** 新增/覆盖单位模板 */
  unitTemplates?: UnitTemplate[]

  /**
   * 国际化文本，支持两种格式：
   * - 扁平格式（单语言/兼容旧版）：{ "branch.army": "陆军" }，将作为默认语言存储
   * - 分层格式（多语言）：{ "zh-CN": { "branch.army": "陆军" }, "en": { "branch.army": "Army" } }
   * 后注入的值覆盖先前已有的同名键。
   */
  i18n?: Record<string, string> | Record<string, Record<string, string>>
  /** 战斗公式覆盖 */
  combatOverrides?: ModCombatOverrides
  /** 战役地图配置（type='campaign' 时有效） */
  mapConfig?: import('$lib/classes/types/battle').CampaignMapConfig
  /** 战役初始部署（type='campaign' 时有效） */
  deployments?: import('$lib/classes/types/battle').CampaignDeployment
  /** 战役设施列表（type='campaign' 时有效，Phase 2 使用） */
  facilities?: import('$lib/classes/types/battle').Facility[]
  /** 战役事件列表（type='campaign' 时有效，Phase 6 使用） */
  events?: import('$lib/classes/types/battle').CampaignEvent[]
  /** 传感器注册表（type='campaign' 时有效，Phase 3 使用） */
  sensors?: import('$lib/classes/types/battle').SensorDefinition[]
  /** 状态效果定义（Phase 4 使用） */
  statusDefinitions?: import('$lib/classes/types/battle').StatusDefinition[]
}
