import { writable } from 'svelte/store';
import type { Battle } from '$lib/classes/types/battle';

export interface GameClockState {
	/** 推演当前时刻 */
	currentDate: Date;
	/** 推演起始时刻（用于计算经过时间） */
	simStart: Date;
	/** 流速倍率：真实 1 秒 = 模拟 timeScale 秒 */
	timeScale: number;
	/** 是否暂停 */
	isPaused: boolean;
}

/** 可选流速档位（单位：模拟秒/真实秒） */
export const TIME_SCALES = [60, 3600, 86400] as const;
export type TimeScale = (typeof TIME_SCALES)[number];

export const TIME_SCALE_LABELS: Record<number, string> = {
	60: '1分/秒',
	3600: '1时/秒',
	86400: '1日/秒'
};

const DEFAULT_START = new Date('2026-01-01T00:00:00');

/** 推演时钟 Store（起始 2026-01-01 00:00:00，初始暂停） */
export const gameClock = writable<GameClockState>({
	currentDate: DEFAULT_START,
	simStart: DEFAULT_START,
	timeScale: 60,
	isPaused: true
});

/** 从战局配置初始化游戏时钟 */
export function initGameClock(battle: Battle): void {
	const simStart = battle.startDate
		? new Date(battle.startDate + 'T00:00:00')
		: DEFAULT_START;
	const timeScale = battle.timeScale ?? 60;
	gameClock.set({
		currentDate: battle.simulatedDate ? new Date(battle.simulatedDate) : simStart,
		simStart,
		timeScale,
		isPaused: true
	});
}
