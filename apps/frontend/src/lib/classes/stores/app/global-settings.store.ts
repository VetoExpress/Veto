import { writable } from 'svelte/store';
import { bootstrapStore, saveToStore, deleteFromStore } from '../../helpers/store-bridge';
import { syncAcrossWindows } from '../../helpers/cross-window-sync';
import { resolveLocale, type Locale } from '@vetoexpress/i18n';

export interface GlobalSettings {
	/** 新建战局时的默认图标风格 */
	defaultIconStyle: 'nato' | 'simple';
	/** 界面语言 */
	language: Locale;
	/** 主题模式 */
	theme: 'light' | 'dark' | 'system';
	/** Display 窗口主展示区 X 偏移（px） */
	displayOffsetX: number;
	/** Display 窗口主展示区 Y 偏移（px） */
	displayOffsetY: number;
	/** 发送匿名应用启动统计 */
	usageAnalyticsEnabled: boolean;
}

const DEFAULTS: GlobalSettings = {
	defaultIconStyle: 'nato',
	language: 'zh-CN',
	theme: 'system',
	displayOffsetX: 0,
	displayOffsetY: 0,
	usageAnalyticsEnabled: true
};

function createGlobalSettings() {
	const store = writable<GlobalSettings>({ ...DEFAULTS });
	const { subscribe, set, update } = store

	// 异步启动：从文件加载（文件是权威来源，同步到 localStorage）
	bootstrapStore<GlobalSettings>('settings', DEFAULTS).then((data) => {
		set({ ...DEFAULTS, ...data, language: resolveLocale(data.language) });
	});

	// 跨窗口同步：其他窗口修改设置后自动更新本地 store
	syncAcrossWindows(store, 'veto_global_settings')

	return {
		subscribe,
		patch(partial: Partial<GlobalSettings>) {
			update((s) => {
				const next = { ...s, ...partial };
				// 双重写入：localStorage + 文件（fire-and-forget）
				saveToStore('settings', next);
				return next;
			});
		},
		async reset() {
			set({ ...DEFAULTS });
			await deleteFromStore('settings');
		}
	};
}

export const globalSettings = createGlobalSettings();
