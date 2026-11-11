/**
 * simulation-engine.ts
 * ──────────────────────────────────────────────
 * 地图推演引擎：地图 PlacedUnit 移动 + HOI4 风格战斗结算
 *
 * 核心公式（每帧）
 *   deltaSimSec = (deltaRealMs / 1000) × timeScale
 *   distMoved   = (speed_km_h / 3600) × deltaSimSec   [km]
 *
 * 战斗结算（每 combatIntervalMs 模拟时间执行一次）
 *   - 扫描射程内非友方单位
 *   - 软攻/硬攻选择：目标为 armor 用 hardAttack，否则用 softAttack
 *   - 组织度低于阈值时攻击力和速度线性衰减
 *   - 伤害分配比例和防御系数从 ModCombatOverrides 读取
 */

import { get } from 'svelte/store';
import { t } from '$lib/i18n';
import { gameClock } from './game-clock.store';
import {
	tickMapMovement,
	initRuntimePositions,
	flushRuntimePositions,
	currentBattle,
	currentBattleId,
	battles,
	runtimePositions,
	addLog,
	autoAttackEnabled,
	moveToFallen
} from '../../stores/battle/battle-store';
import type { RuntimeUnitPosition } from '../../stores/battle/battle-store';
import type { Contact } from '$lib/classes/types/battle';
import { mods } from '$lib/classes/services/plugin/mod-registry.svelte';
import type { ModCombatOverrides } from '$lib/classes/types/battle';
import { getFormula, getEffectiveOverrides } from '$lib/classes/services/engine/registry/formula-registry';
import type { CombatContext } from '$lib/classes/services/engine/registry/formula-registry';
import {
	getEffectiveStats,
	tickStatusEffects,
	applyStatusEffect,
	hasStatusEffect,
	removeStatusEffect
} from '$lib/classes/services/engine/registry/status-registry';
import {
	runDetectionScan,
	tickContactDecay,
	mergeContacts,
	getMaxDetectionRange,
	type ObserverInfo,
	type TargetInfo
} from '$lib/classes/services/engine/registry/sensor-registry';

// ---- 引擎状态（模块级单例） ----
let rafId: number | null = null;
let lastTimestamp: number | null = null;

// ---- 战斗结算状态 ----
/** 模拟时间累计器（ms），随加速倍率缩放，每 combatIntervalMs 触发一次战斗结算 */
let combatAccumMs = 0;

/** 定期写回 localStorage 的累计器（每 30s 真实时间写一次） */
let periodicFlushAccumMs = 0;
const PERIODIC_FLUSH_INTERVAL_MS = 30_000;

/** 传感器扫描累计器（每 2s 真实时间扫描一次，Phase 3） */
let sensorAccumMs = 0;
const SENSOR_INTERVAL_MS = 2_000;

/** 上一帧是否处于暂停状态（用于检测暂停切换，触发即时 flush） */
let wasPaused = true;

/**
 * 获取当前生效的战斗覆盖参数
 */
function getCombatOverrides(): Required<ModCombatOverrides> {
	return mods.getCombatOverrides();
}

/**
 * 已放置单位（地图 PlacedUnit）战斗结算。
 * 使用 runtimePositions 的 lat/lng/hp/org 数据；战斗属性从 battles 静态读取。
 * 结果仅写 runtimePositions，不触发 localStorage。
 *
 * Phase 4：战斗计算使用状态修正后的有效属性；
 * 组织度归零时自动施加溃退（routed）状态。
 */
function handlePlacedCombat() {
	const battle = get(currentBattle);
	if (!battle || battle.placedUnits.length < 2) return;

	const placedMap = new Map(battle.placedUnits.map((p) => [p.id, p]));
	const overrides = getCombatOverrides();
	const clock = get(gameClock);
	const simTimeMs = clock.currentDate.getTime();

	// 获取公式（Phase 1 使用默认公式，Phase 2 可被插件覆盖）
	const calcNetDamage = getFormula('calcNetDamage');
	const calcEfficiency = getFormula('calcEfficiency');

	runtimePositions.update((positions) => {
		const next = { ...positions };

		for (const [attackerId, attackerPos] of Object.entries(positions)) {
			if (attackerPos.hp <= 0) {
				next[attackerId] = { ...attackerPos, isEngaged: false };
				continue;
			}

			const attackerPlaced = placedMap.get(attackerId);
			if (!attackerPlaced) continue;

			// Phase 4：使用状态修正后的有效攻击属性
			const attackerEffStats = getEffectiveStats(attackerPlaced.stats, attackerPos.statusEffects);

			// Phase 5：行为姿态修正攻击属性
			const behavior = attackerPos.behavior ?? attackerPlaced.behavior ?? 'aggressive';
			if (behavior === 'defensive') {
				attackerEffStats.softAttack = (attackerEffStats.softAttack ?? 0) * 0.7;
				attackerEffStats.hardAttack = (attackerEffStats.hardAttack ?? 0) * 0.7;
				attackerEffStats.airAttack = (attackerEffStats.airAttack ?? 0) * 0.7;
				attackerEffStats.defense = (attackerEffStats.defense ?? 0) * 1.5;
			}

			const rangeKm = (behavior === 'defensive'
				? (attackerEffStats.attackRange ?? attackerPlaced.stats.attackRange) * 0.5
				: attackerEffStats.attackRange ?? attackerPlaced.stats.attackRange);
			let engaged = false;

			// Phase 5：cautious 单位不主动索敌，仅在被攻击时反击
			const skipEngage = behavior === 'cautious';

			// Phase 9：手动攻击目标优先处理
			const manualTargetId = attackerPlaced.attackTargetId;
			if (manualTargetId) {
				const targetPos = positions[manualTargetId];
				const targetPlaced = placedMap.get(manualTargetId);
				if (targetPos && targetPlaced && targetPos.hp > 0 && targetPlaced.factionId !== attackerPlaced.factionId) {
					const dLatKm = (targetPos.lat - attackerPos.lat) * 111;
					const dLngKm = (targetPos.lng - attackerPos.lng) * 111 * Math.cos((attackerPos.lat * Math.PI) / 180);
					const distKm = Math.sqrt(dLatKm * dLatKm + dLngKm * dLngKm);
					// 手动攻击允许 2x 射程（模拟主动出击）
					if (distKm <= rangeKm * 2) {
						engaged = true;
						const targetEffStats = getEffectiveStats(targetPlaced.stats, targetPos.statusEffects);
						const combatCtx: CombatContext = {
							attacker: { stats: attackerEffStats, hp: attackerPos.hp, org: attackerPos.org },
							target: { stats: targetEffStats, hp: targetPos.hp, org: targetPos.org },
							distanceKm: distKm,
							overrides
						};
						let netDmg = 0;
						if (calcNetDamage) {
							netDmg = calcNetDamage(combatCtx);
						} else {
							const orgRatio = attackerPlaced.stats.maxOrg > 0 ? attackerPos.org / attackerPlaced.stats.maxOrg : 1;
							const efficiency = orgRatio < overrides.orgPenaltyThreshold ? orgRatio / overrides.orgPenaltyThreshold : 1;
							const hardness = targetEffStats.hardness ?? 0;
							const atkBase = (attackerEffStats.softAttack ?? 0) * (1 - hardness) + (attackerEffStats.hardAttack ?? 0) * hardness;
							netDmg = Math.max(0, atkBase * efficiency - (targetEffStats.defense ?? 0) * overrides.defenseCoeff);
						}
						next[manualTargetId] = {
							...next[manualTargetId],
							hp: Math.max(0, next[manualTargetId].hp - netDmg * overrides.hpDamageRatio),
							org: Math.max(0, next[manualTargetId].org - netDmg * overrides.orgDamageRatio)
						};
					}
				}
			}

			// Phase 9：自动索敌开关关闭时跳过范围索敌
			if (!get(autoAttackEnabled) && !engaged) {
				next[attackerId] = { ...next[attackerId], isEngaged: false };
				continue;
			}

			for (const [targetId, targetPos] of Object.entries(positions)) {
				if (targetId === attackerId) continue;
				if (targetPos.hp <= 0) continue;

				const targetPlaced = placedMap.get(targetId);
				if (!targetPlaced) continue;
				// 友方跳过
				if (targetPlaced.factionId === attackerPlaced.factionId) continue;

				// 球面近似距离 (km)
				const dLatKm = (targetPos.lat - attackerPos.lat) * 111;
				const dLngKm =
					(targetPos.lng - attackerPos.lng) *
					111 *
					Math.cos((attackerPos.lat * Math.PI) / 180);
				const distKm = Math.sqrt(dLatKm * dLatKm + dLngKm * dLngKm);
				if (distKm > rangeKm) continue;

				// Phase 5：cautious 单位不主动攻击
				if (skipEngage && !targetPos.isEngaged) continue;

				engaged = true;

				// Phase 4：目标使用状态修正后的有效防御属性
				const targetEffStats = getEffectiveStats(targetPlaced.stats, targetPos.statusEffects);

				// 构建战斗上下文（用于公式计算）
				const combatCtx: CombatContext = {
					attacker: {
						stats: attackerEffStats,
						hp: attackerPos.hp,
						org: attackerPos.org
					},
					target: {
						stats: targetEffStats,
						hp: targetPos.hp,
						org: targetPos.org
					},
					distanceKm: distKm,
					overrides
				};

				// 使用公式注册表计算净伤害
				let netDmg = 0;
				if (calcNetDamage) {
					netDmg = calcNetDamage(combatCtx);
				} else {
					// 回退：内联计算（与默认公式逻辑一致）
					const orgRatio =
						attackerPlaced.stats.maxOrg > 0
							? attackerPos.org / attackerPlaced.stats.maxOrg
							: 1;
					const efficiency =
						orgRatio < overrides.orgPenaltyThreshold
							? orgRatio / overrides.orgPenaltyThreshold
							: 1;
					const hardness = targetEffStats.hardness ?? 0;
					const targetMilUnit = battle.factions
						.flatMap((f) => f.units)
						.find((u) => u.id === targetPlaced.unitId);
					const atkBase =
						targetMilUnit?.branchId === 'air_force'
							? (attackerEffStats.airAttack ?? 0)
							: (attackerEffStats.softAttack ?? 0) * (1 - hardness) +
								(attackerEffStats.hardAttack ?? 0) * hardness;
					netDmg = Math.max(
						0,
						atkBase * efficiency - (targetEffStats.defense ?? 0) * overrides.defenseCoeff
					);
				}

				// 使用 overrides 中的伤害分配比例（替代硬编码0.7/0.3）
				next[targetId] = {
					...next[targetId],
					hp: Math.max(0, next[targetId].hp - netDmg * overrides.hpDamageRatio),
					org: Math.max(0, next[targetId].org - netDmg * overrides.orgDamageRatio)
				};
			}

			// Phase 4：仅更新交战标记，姿态由 resolveStatus 统一管理
			if (engaged !== attackerPos.isEngaged) {
				next[attackerId] = { ...next[attackerId], isEngaged: engaged };
			}
		}

		// 战斗结算后处理
		for (const id of Object.keys(next)) {
			const pos = next[id];

			// HP 归零 → 阵亡
			if (pos.hp <= 0 && pos.status !== 'destroyed') {
				next[id] = { ...pos, status: 'destroyed', route: [], isEngaged: false, statusEffects: [] };
				continue;
			}

			// Phase 5：hold 单位不撤退
			const bh = pos.behavior ?? placedMap.get(id)?.behavior ?? 'aggressive';
			if (bh === 'hold') {
				if (pos.hp <= 0 && pos.status !== 'destroyed') {
					next[id] = { ...pos, status: 'destroyed', route: [], isEngaged: false, statusEffects: [] };
				}
				continue;
			}

			// Phase 4：Organisation 归零 → 自动施加溃退状态
			const placed = placedMap.get(id);
			if (placed && pos.org <= 0 && !hasStatusEffect(pos.statusEffects, 'routed')) {
				const maxOrg = placed.stats.maxOrg ?? 100;
				const restoredOrg = maxOrg * 0.3; // 溃退时恢复部分组织度
				next[id] = {
					...pos,
					org: restoredOrg,
					status: 'retreating',
					statusEffects: applyStatusEffect(pos.statusEffects, 'routed', simTimeMs, undefined, 'combat')
				};
			}

			// Phase 4：推进状态效果计时（移除过期效果）
			if (pos.statusEffects && pos.statusEffects.length > 0) {
				const ticked = tickStatusEffects(pos.statusEffects, simTimeMs);
				if (ticked.length !== pos.statusEffects.length) {
					next[id] = { ...next[id], statusEffects: ticked };
				}
			}
		}

		return next;
	});

	// Phase 9：检测并记录战斗事件
	const updatedPositions = get(runtimePositions);
	const staticUnitMap = new Map(battle.placedUnits.map(p => [p.id, p]));
	for (const [id, pos] of Object.entries(updatedPositions)) {
		const up = staticUnitMap.get(id);
		if (!up) continue;
		const u = battle.factions.flatMap(f => f.units).find(u2 => u2.id === up.unitId);
		const un = u?.name ?? up.unitId;
		if (pos.status === 'destroyed' && up.status !== 'destroyed') {
			moveToFallen(id)
		} else if (pos.status === 'retreating' && up.status !== 'retreating') {
			addLog(t('components_battle_unit_routed', { unit: un }), { category: 'combat', location: { lat: pos.lat, lng: pos.lng }, sourceUnitId: id });
		}
	}
}

// ---- 传感器扫描（Phase 3） ----

	/**
	 * 执行传感器探测 pass：对每个阵营的每个有传感器单位，
	 * 扫描敌方单位，更新 factionContacts。
	 */
	function runSensorPass() {
		const battle = get(currentBattle);
		if (!battle || battle.factions.length < 2) return;

		const clock = get(gameClock);
		const simTimeMs = clock.currentDate.getTime();
		const positions = get(runtimePositions);

		// 确保每个阵营都有 factionContacts 条目
		const contacts: Record<string, Contact[]> = { ...battle.factionContacts };
		for (const faction of battle.factions) {
			if (!contacts[faction.id]) {
				contacts[faction.id] = [];
			}
		}

		// 对每个阵营
		for (const faction of battle.factions) {
			const factionUnits = battle.placedUnits.filter(
				(u) => u.factionId === faction.id && u.status !== 'destroyed'
			);

			// 对阵营内每个有传感器的存活单位
			for (const unit of factionUnits) {
				const pos = positions[unit.id];
				if (!pos || pos.hp <= 0) continue;

				// 收集该单位的 sensorIds（优先用 PlacedUnit，fallback 到 UnitTemplate）
				let sensorIds: string[] | undefined = unit.sensorIds;
				if (!sensorIds || sensorIds.length === 0) {
					const template = faction.units.find((t) => t.id === unit.unitId);
					sensorIds = template?.sensorIds;
				}
				if (!sensorIds || sensorIds.length === 0) continue;

				const maxRange = getMaxDetectionRange(sensorIds);
				if (maxRange <= 0) continue;

				// 构建 observer
				const observer: ObserverInfo = {
					placedUnitId: unit.id,
					lat: pos.lat,
					lng: pos.lng,
					sensorIds,
					factionId: faction.id
				};

				// 收集所有敌方单位作为潜在目标
				const enemyUnits: TargetInfo[] = [];
				for (const otherFaction of battle.factions) {
					if (otherFaction.id === faction.id) continue;
					for (const enemyUnit of battle.placedUnits) {
						if (enemyUnit.factionId !== otherFaction.id) continue;
						if (enemyUnit.status === 'destroyed') continue;
						const enemyPos = positions[enemyUnit.id];
						if (!enemyPos || enemyPos.hp <= 0) continue;

						enemyUnits.push({
							placedUnitId: enemyUnit.id,
							lat: enemyPos.lat,
							lng: enemyPos.lng,
							factionId: enemyUnit.factionId,
							unitId: enemyUnit.unitId
						});
					}
				}

				// 扫描
				const newContacts = runDetectionScan(observer, enemyUnits, simTimeMs);
				if (newContacts.length > 0) {
					contacts[faction.id] = mergeContacts(contacts[faction.id], newContacts);
				}
			}

			// 衰减该阵营的现有接触
			if (contacts[faction.id].length > 0) {
				contacts[faction.id] = tickContactDecay(contacts[faction.id], simTimeMs);
			}
		}

		// 写回 battle.factionContacts
		const battleId = get(currentBattleId);
		if (battleId) {
			battles.update((list) =>
				list.map((b) => {
					if (b.id !== battleId) return b;
					return { ...b, factionContacts: contacts };
				})
			);
		}
	}





	// ---- 堆叠惩罚（Phase 5） ----

	/**
	 * 检测同阵营单位过密堆叠，施加 overcrowded 状态。
	 */
	function handleStackingPenalties() {
		const battle = get(currentBattle);
		if (!battle || battle.placedUnits.length < 3) return;

		const positions = get(runtimePositions);
		const clock = get(gameClock);
		const simTimeMs = clock.currentDate.getTime();
		const STACKING_THRESHOLD_KM = 0.5;

		for (const faction of battle.factions) {
			const factionUnits = battle.placedUnits.filter(
				(u) => u.factionId === faction.id && u.status !== 'destroyed'
			);
			if (factionUnits.length < 2) continue;

			const stackedGroups: string[][] = [];
			const processed = new Set<string>();

			for (const unitA of factionUnits) {
				if (processed.has(unitA.id)) continue;
				const posA = positions[unitA.id];
				if (!posA || posA.hp <= 0) continue;

				const group: string[] = [unitA.id];
				for (const unitB of factionUnits) {
					if (unitB.id === unitA.id || processed.has(unitB.id)) continue;
					const posB = positions[unitB.id];
					if (!posB || posB.hp <= 0) continue;
					const dLatKm = (posB.lat - posA.lat) * 111;
					const dLngKm = (posB.lng - posA.lng) * 111 * Math.cos((posA.lat * Math.PI) / 180);
					const distKm = Math.sqrt(dLatKm * dLatKm + dLngKm * dLngKm);
					if (distKm < STACKING_THRESHOLD_KM) {
						group.push(unitB.id);
					}
				}
				if (group.length >= 2) {
					stackedGroups.push(group);
					group.forEach((id) => processed.add(id));
				}
			}

			for (const group of stackedGroups) {
				for (const unitId of group) {
					const pos = positions[unitId];
					if (!pos) continue;
					if (!hasStatusEffect(pos.statusEffects, 'overcrowded')) {
						runtimePositions.update((p) => {
							const cur = p[unitId];
							if (!cur) return p;
							return {
								...p,
								[unitId]: {
									...cur,
									statusEffects: applyStatusEffect(cur.statusEffects, 'overcrowded', simTimeMs)
								}
							};
						});
					}
				}
			}

			const allStackedIds = new Set(stackedGroups.flat());
			for (const unit of factionUnits) {
				if (allStackedIds.has(unit.id)) continue;
				const pos = positions[unit.id];
				if (!pos || pos.hp <= 0) continue;
				if (hasStatusEffect(pos.statusEffects, 'overcrowded')) {
					runtimePositions.update((p) => {
						const cur = p[unit.id];
						if (!cur) return p;
						return {
							...p,
							[unit.id]: {
								...cur,
								statusEffects: removeStatusEffect(cur.statusEffects, 'overcrowded')
							}
						};
					});
				}
			}
		}
	}

	// ---- 设施效果（Phase 5） ----

	/**
	 * 检查设施覆盖范围内的单位，自动施加/移除设施相关状态。
	 */
	function handleFacilityEffects() {
		const battle = get(currentBattle);
		if (!battle || !battle.facilities || battle.facilities.length === 0) return;

		const positions = get(runtimePositions);
		const clock = get(gameClock);
		const simTimeMs = clock.currentDate.getTime();

		for (const facility of battle.facilities) {
			const facilityRange = typeof facility.properties?.range === 'number'
				? facility.properties.range
				: 1;

			const unitsInRange: string[] = [];
			for (const unit of battle.placedUnits) {
				if (unit.status === 'destroyed') continue;
				if (facility.factionId && unit.factionId !== facility.factionId) continue;
				const pos = positions[unit.id];
				if (!pos || pos.hp <= 0) continue;
				const dLatKm = (pos.lat - facility.lat) * 111;
				const dLngKm = (pos.lng - facility.lng) * 111 * Math.cos((facility.lat * Math.PI) / 180);
				const distKm = Math.sqrt(dLatKm * dLatKm + dLngKm * dLngKm);
				if (distKm <= facilityRange) {
					unitsInRange.push(unit.id);
				}
			}

			const maxCap = facility.maxCapacity ?? 999;
			let statusId: string | null = null;
			switch (facility.type) {
				case 'fortress': statusId = 'fortified'; break;
				case 'trench_network': statusId = 'entrenched'; break;
				case 'supply_depot': statusId = 'resupplying'; break;
			}

			if (!statusId) continue;

			for (let i = 0; i < unitsInRange.length; i++) {
				const unitId = unitsInRange[i];
				const pos = positions[unitId];
				if (!pos) continue;

				if (i < maxCap) {
					if (!hasStatusEffect(pos.statusEffects, statusId)) {
						runtimePositions.update((p) => {
							const cur = p[unitId];
							if (!cur) return p;
							return {
								...p,
								[unitId]: {
									...cur,
									statusEffects: applyStatusEffect(cur.statusEffects, statusId!, simTimeMs)
								}
							};
						});
					}
				} else {
					if (hasStatusEffect(pos.statusEffects, statusId)) {
						runtimePositions.update((p) => {
							const cur = p[unitId];
							if (!cur) return p;
							return {
								...p,
								[unitId]: {
									...cur,
									statusEffects: removeStatusEffect(cur.statusEffects, statusId!)
								}
							};
						});
					}
				}
			}

			for (const unit of battle.placedUnits) {
				if (unitsInRange.includes(unit.id)) continue;
				if (unit.status === 'destroyed') continue;
				const pos = positions[unit.id];
				if (!pos || pos.hp <= 0) continue;
				if (facility.factionId && unit.factionId !== facility.factionId) continue;
				if (hasStatusEffect(pos.statusEffects, statusId)) {
					runtimePositions.update((p) => {
						const cur = p[unit.id];
						if (!cur) return p;
						return {
							...p,
							[unit.id]: {
								...cur,
								statusEffects: removeStatusEffect(cur.statusEffects, statusId!)
							}
						};
					});
				}
			}
		}
	}
// ---- RAF 主循环 ----

function tick(timestamp: number) {
	rafId = requestAnimationFrame(tick);

	const clock = get(gameClock);

	// 暂停时仅更新时间戳，不推进模拟（战斗也停止）
	// 检测到由运行→暂停的切换时，立即 flush 运行时位置到 battles
	if (clock.isPaused) {
		if (!wasPaused) {
			wasPaused = true;
			flushRuntimePositions();
		}
		lastTimestamp = timestamp;
		return;
	}
	wasPaused = false;

	const deltaRealMs = lastTimestamp !== null ? timestamp - lastTimestamp : 0;
	lastTimestamp = timestamp;

	// 跳过首帧或异常大帧（切换标签页、debugger 断点等）
	if (deltaRealMs <= 0 || deltaRealMs > 500) return;

	const deltaSimSec = (deltaRealMs / 1000) * clock.timeScale;

	// 1. 推进推演日期
	gameClock.update((c) => ({
		...c,
		currentDate: new Date(c.currentDate.getTime() + deltaSimSec * 1000)
	}));

	// 2. 推进地图上的 PlacedUnit 沿路线行进
	tickMapMovement(deltaSimSec);

	// 3. 战斗结算（累计模拟时间，随加速倍率缩放）
	const overrides = getCombatOverrides();
	const combatInterval = overrides.combatIntervalMs;
	const deltaSimMs = deltaSimSec * 1000
	combatAccumMs += deltaSimMs
	while (combatAccumMs >= combatInterval) {
		combatAccumMs -= combatInterval
		handlePlacedCombat()
	}

	// 4. 传感器扫描（Phase 3）+ 设施效果 + 堆叠惩罚（Phase 5）
	sensorAccumMs += deltaRealMs;
	if (sensorAccumMs >= SENSOR_INTERVAL_MS) {
		sensorAccumMs -= SENSOR_INTERVAL_MS;
		runSensorPass();
		handleFacilityEffects();
		handleStackingPenalties();
	}

	// 5. 定期将运行时位置写回 battles（约每 30s），确保进度持久化
	periodicFlushAccumMs += deltaRealMs;
	if (periodicFlushAccumMs >= PERIODIC_FLUSH_INTERVAL_MS) {
		periodicFlushAccumMs = 0;
		flushRuntimePositions();
	}
}

// ---- 公开 API ----

/** 启动引擎（幂等；仅浏览器环境有效） */
export function startEngine(): void {
	if (typeof requestAnimationFrame === 'undefined') return;
	if (rafId !== null) return;
	lastTimestamp = null;
	combatAccumMs = 0;
	periodicFlushAccumMs = 0;
	wasPaused = true;
	initRuntimePositions();
	rafId = requestAnimationFrame(tick);
}

/** 停止引擎并释放 RAF 句柄 */
export function stopEngine(): void {
	if (rafId !== null) {
		cancelAnimationFrame(rafId);
		rafId = null;
		lastTimestamp = null;
		flushRuntimePositions();
	}
}

/** 重置引擎内部计时器（配合 resetAll 使用，确保战斗累计器清零） */
export function resetEngineTimers(): void {
	lastTimestamp = null;
	combatAccumMs = 0;
	periodicFlushAccumMs = 0;
	wasPaused = true;
}

/** 引擎当前是否运行（不管暂停状态） */
export function isEngineRunning(): boolean {
	return rafId !== null;
}
