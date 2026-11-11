/**
 * route.store.ts
 * ──────────────
 * 路线规划 + 危机指令系统。
 * 合并自 pending-route.store.ts 和 unit-command.store.ts。
 */
import { writable, get } from 'svelte/store';
import { t } from '$lib/i18n';
import { addRoutePoint, clearRoute, insertRoutePoint, addLog, runtimePositions } from './battle-store';

// ── 待确认路线（绘制模式） ──────────────────────────────────────────

export interface PendingRoute {
	placedId: string;
	unitName: string;
	/** reset = 清空旧路线再追加；append = 在现有路线末尾追加 */
	type: 'reset' | 'append';
	points: [number, number][];
}

export const pendingRoute = writable<PendingRoute | null>(null);

export function startPendingRoute(placedId: string, unitName: string, type: 'reset' | 'append') {
	pendingRoute.set({ placedId, unitName, type, points: [] });
}

export function addPendingPoint(lat: number, lng: number) {
	pendingRoute.update((pr) => {
		if (!pr) return null;
		return { ...pr, points: [...pr.points, [lat, lng]] };
	});
}

export function applyPendingRoute() {
	const pr = get(pendingRoute);
	if (!pr || pr.points.length === 0) return;

	const insertMode = get(routeInsertMode);

	if (insertMode) {
		// F3 插入模式：在选中节点之后依次插入所有 pending 节点
		let idx = insertMode.afterIndex + 1;
		for (const [lat, lng] of pr.points) {
			insertRoutePoint(insertMode.placedId, idx, lat, lng);
			idx++;
		}
		routeInsertMode.set(null);
	} else if (pr.type === 'reset') {
		clearRoute(pr.placedId);
		for (const [lat, lng] of pr.points) {
			addRoutePoint(pr.placedId, lat, lng);
		}
	} else {
		// append 模式
		for (const [lat, lng] of pr.points) {
			addRoutePoint(pr.placedId, lat, lng);
		}
	}
	pendingRoute.set(null);
}

export function cancelPendingRoute() {
	pendingRoute.set(null);
	routeInsertMode.set(null);
}

// ── 路径点编辑状态 ──────────────────────────────────────────

export interface SelectedWaypoint {
	placedId: string;
	index: number;
}
export const selectedWaypoint = writable<SelectedWaypoint | null>(null);

export interface RouteInsertState {
	placedId: string;
	afterIndex: number;
}
export const routeInsertMode = writable<RouteInsertState | null>(null);

/** 一键清除所有路线编辑临时状态 */
export function clearRouteEditState() {
	selectedWaypoint.set(null);
	routeInsertMode.set(null);
	cancelPendingRoute();
}

// ── 危机指令系统（推演运行期间的单次指令） ──────────────────────────

export interface PendingCrisisCommand {
	placedId: string;
	unitName: string;
	lat: number;
	lng: number;
}

export const pendingCrisisCommand = writable<PendingCrisisCommand | null>(null);

/** 发布新路线节点指令。阵亡单位拒绝接收。 */
export function issueCrisisCommand(
	placedId: string,
	unitName: string,
	lat: number,
	lng: number
) {
	const pos = get(runtimePositions)[placedId];
	if (pos && (pos.status === 'destroyed' || pos.hp <= 0)) return;
	pendingCrisisCommand.set({ placedId, unitName, lat, lng });
}

/** 确认指令：将坐标写入路线，清空待命状态。 */
export function applyCrisisCommand() {
	const cmd = get(pendingCrisisCommand);
	if (!cmd) return;
	addRoutePoint(cmd.placedId, cmd.lat, cmd.lng);
	addLog(
		t('components_battle_route_command_confirmed', { unit: cmd.unitName, lat: cmd.lat.toFixed(4), lng: cmd.lng.toFixed(4) })
	);
	pendingCrisisCommand.set(null);
}

/** 取消指令：丢弃待命节点。 */
export function cancelCrisisCommand() {
	const cmd = get(pendingCrisisCommand);
	if (cmd) {
		addLog(t('components_battle_route_command_cancelled', { unit: cmd.unitName, lat: cmd.lat.toFixed(4), lng: cmd.lng.toFixed(4) }));
	}
	pendingCrisisCommand.set(null);
}
