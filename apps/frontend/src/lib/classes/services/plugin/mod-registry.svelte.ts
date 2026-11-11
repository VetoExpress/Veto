import type {
	BranchDefinition,
	CategoryDefinition,
	UnitTemplate,
	ModData,
	ModMetadata,
	ModCombatOverrides
} from '$lib/classes/types/battle';
import type { PluginManifest } from '$lib/classes/services/plugin/plugin-db';
import { registerStatusDefinitions } from '../engine/registry/status-registry';
import { registerSensorDefinitions } from '../engine/registry/sensor-registry';
import { createLogger } from '$lib/classes/logger';
import { defaultLocale, resolveLocale } from '@vetoexpress/i18n';

const log = createLogger('ModRegistry')
const modLog = createLogger('Mods')

/** Mod 元数据（轻量，仅从 manifest 读取，供大厅列表展示） */

// ── ModRegistry ───────────────────────────────────────────────────────────────

/**
 * ModRegistry — 全局单例注册表。
 *
 * 两级数据隔离：
 * - **_sys（系统快照）**：仅含 source='system' 的基础游戏数据，始终有效，不受战局影响。
 * - **_battle（战局快照）**：含系统数据 + 本局选定用户 Mod，仅在战局期间有效。
 *
 * 大厅状态：`registry.branches` 等访问系统快照。
 * 战局状态：`registry.branches` 等访问战局快照；大厅切换开关不影响此快照。
 */
class ModRegistry {
	/** 所有已注册 Mod 条目（按注入顺序）- Svelte 5 响应式状态 */
	private _entries = $state<ModData[]>([]);
	private _loaded: boolean = false;
	// ── 注册 ──────────────────────────────────────────────────────────────────

	/**
	 * 注入 Mod 数据包。同一 id 不会重复加载。
	 * - `source='system'`：立即写入系统快照，始终生效。
	 * - `source='user'`：仅登记元数据与数据包，**不写入任何快照**；
	 *   须调用 `prepareBattleRegistry()` 才能在战局中生效。
	 */
	load(mod: ModData): void {
		const id = mod.id ?? `_anon_${this._entries.length}`;
		if (this._entries.some((e) => e.id === id)) {
			log.warn('duplicate detected:', id);
			return;
		}
		this._entries.push(mod);
		log.info('loaded:', id, 'total entries:', this._entries.length);
	}

	/** 卸载指定 Mod（从注册表移除） */
	unload(id: string): void {
		const idx = this._entries.findIndex((e) => e.id === id);
		if (idx !== -1) {
			this._entries.splice(idx, 1);
			log.info('removed:', id);
		}
	}

	// ── 查询 API ──────────────────────────────────────────────────────────────
	/** 获取所有已注册 Mod 条目 */
	getModList(): ModData[] {
		const list = [...this._entries];
		log.debug(
			'getModList:',
			list.length,
			list.map((m) => m.id)
		);
		return list;
	}
	getBranchesSize(): number {
		return this._entries.reduce((sum, mod) => sum + (mod.branches?.length ?? 0), 0);
	}
	getCategoriesSize(): number {
		return this._entries.reduce((sum, mod) => sum + (mod.categories?.length ?? 0), 0);
	}
	getUnitTemplatesSize(): number {
		return this._entries.reduce((sum, mod) => sum + (mod.unitTemplates?.length ?? 0), 0);
	}
	getMod(id: string): ModData | undefined {
		return this._entries.find((e) => e.id === id);
	}

	/** 重置所有数据（用于测试或热重载） */
	reset(): void {
		this._entries = [];
	}
}

// ── 默认战斗覆盖参数 ──────────────────────────────────────────────────────────

const DEFAULT_COMBAT_OVERRIDES: Required<ModCombatOverrides> = {
	hpDamageRatio: 0.7,
	orgDamageRatio: 0.3,
	defenseCoeff: 0.5,
	orgPenaltyThreshold: 0.2,
	combatIntervalMs: 500
};

// ── Mods ── 战局内实际启用的Mod ────────────────────────
class Mods {
	private readonly branches = new Map<string, BranchDefinition>();
	private readonly categories = new Map<string, CategoryDefinition>();
	private readonly unitTemplates = new Map<string, UnitTemplate>();
	private readonly _i18n = new Map<string, Map<string, string>>();
	/** 合并后的战斗覆盖参数 */
	private _combatOverrides: Required<ModCombatOverrides> = { ...DEFAULT_COMBAT_OVERRIDES };

	private readonly _entries: ModData[] = [];
	/** 当前语言，默认 zh-CN */
	private _locale = $state('zh-CN');

	/** 实际将 mod 数据写入各 Map */
	private _applyModData(mod: ModData): void {
		log.debug(`Applying mod data: ${mod.id} - ${mod.metadata?.name}`);

		for (const branch of mod.branches ?? []) {
			this.branches.set(branch.id, branch);
		}

		for (const cat of mod.categories ?? []) {
			this.categories.set(cat.id, cat);
		}

		for (const template of mod.unitTemplates ?? []) {
			this.unitTemplates.set(template.id, template);
		}

		// 合并战斗覆盖参数（后加载的 Mod 覆盖先加载的）
		if (mod.combatOverrides) {
			this._combatOverrides = {
				...this._combatOverrides,
				...Object.fromEntries(
					Object.entries(mod.combatOverrides).filter(([, v]) => v !== undefined)
				)
			};
			modLog.info(
				`Combat overrides updated:`,
				JSON.stringify(this._combatOverrides)
			);
		}

		const i18nData = mod.i18n;
		if (i18nData) {
			const firstVal = Object.values(i18nData)[0];
			if (firstVal !== undefined && typeof firstVal === 'object') {
				for (const [locale, keys] of Object.entries(
					i18nData as Record<string, Record<string, string>>
				)) {
					const normalized = resolveLocale(locale);
					if (!this._i18n.has(normalized)) this._i18n.set(normalized, new Map());
					const localeMap = this._i18n.get(normalized)!;
					for (const [key, val] of Object.entries(keys)) localeMap.set(key, val);
				}
			} else {
				if (!this._i18n.has(defaultLocale)) this._i18n.set(defaultLocale, new Map());
				const localeMap = this._i18n.get(defaultLocale)!;
				for (const [key, val] of Object.entries(i18nData as Record<string, string>))
					localeMap.set(key, val);
			}
		}
		// 注册状态定义（Phase 4）
		if (mod.statusDefinitions && mod.statusDefinitions.length > 0) {
			registerStatusDefinitions(mod.statusDefinitions);
		}
		// 注册传感器定义（Phase 3）
		if (mod.sensors && mod.sensors.length > 0) {
			registerSensorDefinitions(mod.sensors);
		}

		log.debug(
			`Mod ${mod.id} applied: branches=${mod.branches?.length ?? 0}, categories=${mod.categories?.length ?? 0}, unitTemplates=${mod.unitTemplates?.length ?? 0}`
		);
		log.debug('Mod', mod);
	}

	load(mod: ModData): void {
		const id = mod.id ?? `_anon_${this._entries.length}`;
		if (this._entries.some((e) => e.id === id)) return;

		this._applyModData(mod);
		this._entries.push(mod);
	}

	loadMods(modIds: string[]): void {
		for (const id of modIds) {
			const mod = registry.getMod(id);
			if (mod) this.load(mod);
		}
	}

	/** 卸载指定 Mod 并清理对应数据 */
	unload(id: string): void {
		const mod = this._entries.find((e) => e.id === id);
		if (!mod) return;

		this._entries.splice(this._entries.indexOf(mod), 1);

		// 清除该 Mod 注入的数据
		for (const branch of mod.branches ?? []) {
			this.branches.delete(branch.id);
		}
		for (const cat of mod.categories ?? []) {
			this.categories.delete(cat.id);
		}
		for (const template of mod.unitTemplates ?? []) {
			this.unitTemplates.delete(template.id);
		}

		// 重建 combatOverrides（排除被卸载的 Mod）
		this._combatOverrides = { ...DEFAULT_COMBAT_OVERRIDES };
		for (const entry of this._entries) {
			if (entry.combatOverrides) {
				this._combatOverrides = {
					...this._combatOverrides,
					...Object.fromEntries(
						Object.entries(entry.combatOverrides).filter(([, v]) => v !== undefined)
					)
				};
			}
		}

		modLog.info(`Unloaded mod: ${id}`);
	}

	clear(): void {
		this.branches.clear();
		this.categories.clear();
		this.unitTemplates.clear();
		this._i18n.clear();
		this._combatOverrides = { ...DEFAULT_COMBAT_OVERRIDES };
		this._entries.length = 0;
	}

	// ── 查询 API ──────────────────────────────────────────────────────────────
	get_branches(): Map<string, BranchDefinition> {
		return this.branches;
	}

	get_categories(): Map<string, CategoryDefinition> {
		return this.categories;
	}

	get_unitTemplates(): Map<string, UnitTemplate> {
		return this.unitTemplates;
	}

	/** 获取当前生效的战斗覆盖参数（合并所有已加载 Mod 的覆盖） */
	getCombatOverrides(): Required<ModCombatOverrides> {
		return { ...this._combatOverrides };
	}

	private get_activeI18n(): Map<string, Map<string, string>> {
		return this._i18n;
	}

	setLocale(locale: string): void {
		this._locale = locale;
	}

	getLocale(): string {
		return this._locale;
	}

	getModList(): ModData[] {
		return [...this._entries];
	}

	getBranchTemplates(branchId: string): UnitTemplate[] {
		return [...this.unitTemplates.values()].filter((t) => t.branchId === branchId);
	}
	getCategoryTemplates(categoryId: string): UnitTemplate[] {
		return [...this.unitTemplates.values()].filter((t) => t.categoryId === categoryId);
	}
	getBranchCategories(branchId: string): CategoryDefinition[] {
		return [...this.categories.values()].filter((c) => c.branchId === branchId);
	}
	/**
	 * 万能标签解析函数。
	 * 查找顺序：当前语言 → 第一个可用语言 → defaultText → path 本身
	 */
	getLabel(path: string, defaultText?: string): string {
		const i18n = this.get_activeI18n();
		return (
			i18n.get(this._locale)?.get(path) ?? i18n.get(defaultLocale)?.get(path) ?? defaultText ?? path
		);
	}

	findTemplate(id: string): UnitTemplate | undefined {
		return this.unitTemplates.get(id);
	}

	getNatoCode(template: UnitTemplate): string {
		if (template.natoCode) return template.natoCode;
		const cat = this.categories.get(template.categoryId);
		if (cat?.natoCode) return cat.natoCode;
		return 'GUCI---';
	}
}
/** 全局 ModRegistry 单例 */
export const registry = new ModRegistry();

/** 全局 Mods 单例 */
export const mods = new Mods();

/** 插件加载完成的 Promise（由 +layout.svelte 触发） */
let pluginsReadyResolve: (() => void) | null = null;
export const pluginsReady = new Promise<void>((resolve) => {
	pluginsReadyResolve = resolve;
});

/** 标记插件加载完成（由 +layout.svelte 调用） */
export function markPluginsReady() {
	if (pluginsReadyResolve) {
		pluginsReadyResolve();
		pluginsReadyResolve = null;
	}
}
