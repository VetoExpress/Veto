/**
 * plugin-registry.ts — 拉取远程注册表、下载 .vmod 包、注入 ModRegistry。
 */
import JSZip from 'jszip';
import { t } from '$lib/i18n';
import type { PluginManifest, InstalledPlugin } from './plugin-db';
import { registry } from '$lib/classes/services/plugin/mod-registry.svelte';
import type { ModData, ModMetadata } from '$lib/classes/types/battle';
import { guessMime } from '$lib/classes/utils/mime';

const IMAGE_EXTENSIONS = /\.(png|jpg|jpeg|gif|webp|svg)$/i;

/** 计算 Blob 的 SHA-256 十六进制摘要 */
async function sha256Hex(blob: Blob): Promise<string> {
	const buffer = await blob.arrayBuffer();
	const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
	return Array.from(new Uint8Array(hashBuffer))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/** 从 JSZip 实例中提取所有图片资源的 base64 数据 */
async function extractAssetsForIpc(
	zip: JSZip
): Promise<Array<{ path: string; data: string; mimeType: string }>> {
	const imageFiles = zip.filter((_, f) => !f.dir && IMAGE_EXTENSIONS.test(f.name));
	const assets: Array<{ path: string; data: string; mimeType: string }> = [];
	for (const f of imageFiles) {
		const blob = await f.async('blob');
		const buffer = await blob.arrayBuffer();
		const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
		assets.push({
			path: f.name,
			data: base64,
			mimeType: guessMime(f.name)
		});
	}
	return assets;
}

/**
 * 为 faction / campaign 类型插件从 zip 内按约定路径结构化提取 ModData。
 */
export async function buildStructuredModData(
	zip: JSZip,
	manifest: PluginManifest
): Promise<string | null> {
	let modData: ModData = {};

	if (manifest.definitions) {
		const defPath =
			typeof manifest.definitions === 'string'
				? manifest.definitions
				: Object.values(manifest.definitions)[0];
		const defFile = zip.file(defPath);
		if (defFile) {
			try {
				modData = JSON.parse(await defFile.async('string')) as ModData;
			} catch {
				/* ignore */
			}
		}
	}

	if (!modData.branches) {
		const f = zip.file('branches.json') ?? zip.file('assets/branches.json');
		if (f) {
			try {
				modData.branches = JSON.parse(await f.async('string'));
			} catch {
				/* ignore */
			}
		}
	}

	if (!modData.categories) {
		const f = zip.file('categories.json') ?? zip.file('assets/categories.json');
		if (f) {
			try {
				modData.categories = JSON.parse(await f.async('string'));
			} catch {
				/* ignore */
			}
		}
	}

	if (!modData.unitTemplates) {
		const templateFiles = zip.filter(
			(path, f) =>
				!f.dir &&
				(path.startsWith('unitTemplates/') || path.startsWith('assets/unitTemplates/')) &&
				path.endsWith('.json')
		);
		if (templateFiles.length > 0) {
			const all: unknown[] = [];
			for (const f of templateFiles) {
				try {
					const parsed = JSON.parse(await f.async('string'));
					if (Array.isArray(parsed)) all.push(...parsed);
				} catch {
					/* ignore */
				}
			}
			if (all.length > 0) modData.unitTemplates = all as ModData['unitTemplates'];
		}
	}

	if (!modData.branches && !modData.categories && !modData.unitTemplates) return null;
	return JSON.stringify(modData);
}

const REGISTRY_URL =
	'https://raw.githubusercontent.com/VetoExpress/veto-plugins/main/dist/registry.json';

const STARS_URL = 'https://raw.githubusercontent.com/VetoExpress/veto-plugins/main/stars.json';

/** 拉取远程注册表列表 */
export async function fetchPluginRegistry(): Promise<PluginManifest[]> {
	const res = await fetch(REGISTRY_URL);
	if (!res.ok) throw new Error(t('components_plugin_registry_http_error', { status: res.status }));
	return res.json() as Promise<PluginManifest[]>;
}

/** 拉取插件 Star 数 */
export async function fetchPluginStars(): Promise<Record<string, number>> {
	try {
		const res = await fetch(STARS_URL);
		if (!res.ok) return {};
		return res.json() as Promise<Record<string, number>>;
	} catch {
		return {};
	}
}

/**
 * 从 JSZip 包中提取 definitions、i18n 和图片资源，发送到主进程写入文件系统，
 * 构建 InstalledPlugin 记录并注入运行时 ModRegistry。
 *
 * installPlugin（远程下载）和 importModPackage（本地文件）共用此函数。
 */
export async function processModPackage(
	zip: JSZip,
	manifest: PluginManifest
): Promise<InstalledPlugin> {
	const type = manifest.type
	const isDataMod = type === 'faction' || type === 'campaign'

	// 1. 读取 definitions
	let definitions: string | null = null;
	if (isDataMod) {
		definitions = await buildStructuredModData(zip, manifest);
	} else if (manifest.definitions) {
		const defPath =
			typeof manifest.definitions === 'string'
				? manifest.definitions
				: Object.values(manifest.definitions)[0];
		const defFile = zip.file(defPath);
		if (defFile) definitions = await defFile.async('string');
	}

	// 2. 读取 i18n
	const i18nRecord: Record<string, string> = {};
	if (manifest.i18n) {
		const i18nMap: Record<string, string> =
			typeof manifest.i18n === 'string' ? { default: manifest.i18n } : manifest.i18n;
		for (const [locale, path] of Object.entries(i18nMap)) {
			const f = zip.file(path);
			if (f) i18nRecord[locale] = await f.async('string');
		}
	}
	if (isDataMod) {
		const i18nFiles = zip.filter(
			(path, f) =>
				!f.dir &&
				(path.startsWith('i18n/') || path.startsWith('assets/i18n/')) &&
				path.endsWith('.json')
		);
		for (const f of i18nFiles) {
			const locale = f.name.split('/').pop()?.replace(/\.json$/i, '') ?? '';
			if (locale && !i18nRecord[locale]) {
				i18nRecord[locale] = await f.async('string');
			}
		}
	}

	// 3. 读取席位预设（如果存在）
	let seats: string | null = null
	if (manifest.seats) {
		const delPath = typeof manifest.seats === 'string' ? manifest.seats : 'seats.json'
		const delFile = zip.file(delPath)
		if (delFile) {
			try { seats = await delFile.async('string') } catch { /* ignore */ }
		}
	}
	if (!seats) {
		const delFile = zip.file('seats.json') ?? zip.file('assets/seats.json')
		if (delFile) {
			try { seats = await delFile.async('string') } catch { /* ignore */ }
		}
	}

	// 4. 提取图片资源
	const assets = await extractAssetsForIpc(zip);

	// 5. 发送到主进程写入文件系统
	const result = await window.veto.plugins.install({
		manifest: JSON.parse(JSON.stringify(manifest)),
		definitions,
		i18n: i18nRecord,
		assets,
		seats
	});

	if (!result.success) {
		throw new Error(result.error ?? t('components_plugin_install_failed'));
	}

	// 6. 构建记录并注入运行时 ModRegistry
	const record: InstalledPlugin = {
		id: manifest.id,
		manifest: JSON.parse(JSON.stringify(manifest)),
		definitions,
		i18n: i18nRecord,
		assetKeys: assets.map((a) => `${manifest.id}/${a.path}`),
		installedAt: Date.now(),
		seats
	};
	injectToRegistry(record);

	return record;
}

/**
 * 下载 .vmod 包并持久化到主进程文件系统，同时注入运行时 ModRegistry。
 */
export async function installPlugin(manifest: PluginManifest): Promise<InstalledPlugin> {
	console.log('Installing plugin ', manifest);
	if (!manifest.download_url) {
		throw new Error(t('components_plugin_download_url_missing', { name: manifest.name }));
	}

	const res = await fetch(manifest.download_url);
	if (!res.ok) throw new Error(t('components_plugin_download_http_error', { status: res.status }));
	const blob = await res.blob();

	if (manifest.hash) {
		const actual = await sha256Hex(blob);
		if (actual !== manifest.hash) {
			throw new Error(t('components_plugin_hash_mismatch', { name: manifest.name }));
		}
	}

	let zip: JSZip;
	try {
		zip = await JSZip.loadAsync(blob);
	} catch {
		throw new Error(t('components_plugin_invalid_archive', { name: manifest.name }));
	}

	return processModPackage(zip, manifest);
}

/** 将 InstalledPlugin 数据注入运行时 Mods */
export function injectToRegistry(plugin: InstalledPlugin): void {
	let metaData: ModMetadata = {
		id: plugin.manifest.id,
		name: plugin.manifest.name,
		version: plugin.manifest.version,
		author: plugin.manifest.author,
		description: plugin.manifest.description,
		source: 'user'
	};

	let modData: ModData = {
		id: plugin.id,
		metadata: metaData,
		type: plugin.manifest.type,
		i18n: plugin.i18n
	};

	if (plugin.definitions) {
		try {
			const parsed = JSON.parse(plugin.definitions) as ModData;
			modData = {
				...parsed,
				id: plugin.id,
				metadata: metaData,
				type: plugin.manifest.type
			};
		} catch {
			// definitions 格式不兼容 ModData，跳过
		}
	}

	const i18nFromPlugin: Record<string, Record<string, string>> = {};
	for (const [locale, jsonStr] of Object.entries(plugin.i18n)) {
		try {
			i18nFromPlugin[locale] = JSON.parse(jsonStr) as Record<string, string>;
		} catch {
			/* ignore */
		}
	}
	if (Object.keys(i18nFromPlugin).length > 0) {
		const defI18n = modData.i18n;
		if (defI18n) {
			const isLayered = typeof Object.values(defI18n)[0] === 'object';
			if (isLayered) {
				for (const [locale, keys] of Object.entries(
					defI18n as Record<string, Record<string, string>>
				)) {
					i18nFromPlugin[locale] = { ...keys, ...(i18nFromPlugin[locale] ?? {}) };
				}
			} else {
				i18nFromPlugin['zh-CN'] = {
					...(defI18n as Record<string, string>),
					...(i18nFromPlugin['zh-CN'] ?? {})
				};
			}
		}
		modData = { ...modData, i18n: i18nFromPlugin };
	}

	if (plugin.campaignFiles) {
		if (plugin.campaignFiles.mapConfig) {
			try { modData.mapConfig = JSON.parse(plugin.campaignFiles.mapConfig); } catch { /* ignore */ }
		}
		if (plugin.campaignFiles.deployments) {
			try { modData.deployments = JSON.parse(plugin.campaignFiles.deployments); } catch { /* ignore */ }
		}
		if (plugin.campaignFiles.facilities) {
			try { modData.facilities = JSON.parse(plugin.campaignFiles.facilities); } catch { /* ignore */ }
		}
		if (plugin.campaignFiles.events) {
			try { modData.events = JSON.parse(plugin.campaignFiles.events); } catch { /* ignore */ }
		}
	}

	registry.load(modData);
}
