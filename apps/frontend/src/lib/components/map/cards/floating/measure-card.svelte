<script lang="ts">
  import { t, formatNumber } from '$lib/i18n'
	import * as L from 'leaflet';
	import { Ruler, X, Trash2, MapPin } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { interactionMode } from '$lib/classes/stores/battle/battle-store';
	import { fly } from 'svelte/transition';

	let { map }: { map: L.Map | undefined } = $props();

	// 已经钉下的测量点
	let points: L.LatLng[] = $state([]);
	// 鼠标当前位置（用于预览下一段）
	let hoverLatLng: L.LatLng | null = $state(null);

	// 用于地图上绘制的图层
	let measureLayer: L.LayerGroup | null = null;

	// 把米转成易读的字符串
	function formatDist(meters: number): string {
		if (meters < 1000) return `${formatNumber(Math.round(meters))} m`;
		return `${formatNumber(meters / 1000, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`;
	}

	// 计算两点距离（via Leaflet，底层 Haversine）
	function dist(a: L.LatLng, b: L.LatLng): number {
		return a.distanceTo(b);
	}

	// 各段距离
	const segmentDistances = $derived(points.slice(1).map((p, i) => dist(points[i], p)));

	// 当前总距离（不含预览段）
	const totalDistance = $derived(segmentDistances.reduce((sum, d) => sum + d, 0));

	// 预览段距离（最后一点到鼠标）
	const previewDistance = $derived(
		points.length > 0 && hoverLatLng ? dist(points[points.length - 1], hoverLatLng) : null
	);

	// 重新绘制测量图层
	function redrawLayer() {
		if (!measureLayer || !map) return;
		measureLayer.clearLayers();

		const drawPoints = hoverLatLng ? [...points, hoverLatLng] : [...points];

		if (drawPoints.length >= 2) {
			// 主折线
			L.polyline(drawPoints, {
				color: '#f59e0b',
				weight: 2.5,
				opacity: 0.9,
				dashArray: hoverLatLng ? '8 5' : undefined
			}).addTo(measureLayer);

			// 已钉点之间的实线
			if (points.length >= 2) {
				L.polyline(points, {
					color: '#f59e0b',
					weight: 2.5,
					opacity: 0.9
				}).addTo(measureLayer);
			}
		}

		// 绘制已钉坐标点
		points.forEach((p, i) => {
			L.circleMarker(p, {
				radius: i === 0 ? 7 : 5,
				color: '#f59e0b',
				fillColor: i === 0 ? '#f59e0b' : '#fff',
				fillOpacity: 1,
				weight: 2
			}).addTo(measureLayer!);

			// 每段中点显示距离标注
			if (i > 0) {
				const mid = L.latLng((points[i - 1].lat + p.lat) / 2, (points[i - 1].lng + p.lng) / 2);
				const d = segmentDistances[i - 1];
				L.marker(mid, {
					icon: L.divIcon({
						className: '',
						html: `<div style="
							background:rgba(245,158,11,0.9);
							color:#fff;
							font-size:11px;
							font-weight:600;
							padding:2px 6px;
							border-radius:4px;
							white-space:nowrap;
							pointer-events:none;
							box-shadow:0 1px 4px rgba(0,0,0,0.25);
						">${formatDist(d)}</div>`,
						iconAnchor: [0, 0]
					}),
					interactive: false
				}).addTo(measureLayer!);
			}
		});

		// 鼠标预览点
		if (hoverLatLng && points.length > 0) {
			L.circleMarker(hoverLatLng, {
				radius: 5,
				color: '#f59e0b',
				fillColor: '#fff',
				fillOpacity: 0.8,
				weight: 2,
				opacity: 0.7
			}).addTo(measureLayer!);
		}
	}

	// 监听点和鼠标位置变化，重绘图层
	$effect(() => {
		points;
		hoverLatLng;
		redrawLayer();
	});

	// 挂载/卸载地图事件
	$effect(() => {
		const mode = $interactionMode;
		const m = map;
		if (!m) return;

		if (mode === 'measure') {
			if (!measureLayer) {
				measureLayer = L.layerGroup().addTo(m);
			}

			const onClick = (e: L.LeafletMouseEvent) => {
				if ($interactionMode !== 'measure') return;
				points = [...points, e.latlng];
			};

			const onMouseMove = (e: L.LeafletMouseEvent) => {
				if ($interactionMode !== 'measure') return;
				hoverLatLng = e.latlng;
			};

			const onDblClick = (e: L.LeafletMouseEvent) => {
				// 双击停止，但不退出模式（允许继续查看）
				L.DomEvent.stopPropagation(e);
			};

			m.on('click', onClick);
			m.on('mousemove', onMouseMove);
			m.on('dblclick', onDblClick);

			return () => {
				m.off('click', onClick);
				m.off('mousemove', onMouseMove);
				m.off('dblclick', onDblClick);
			};
		} else {
			// 退出测量模式：清理图层和状态
			if (measureLayer) {
				measureLayer.clearLayers();
				measureLayer.remove();
				measureLayer = null;
			}
			points = [];
			hoverLatLng = null;
		}
	});

	function clearPoints() {
		points = [];
		hoverLatLng = null;
	}

	function cancel() {
		interactionMode.set('select');
	}
</script>

{#if $interactionMode === 'measure'}
	<!-- 底部中央浮动面板 -->
	<div
		class="absolute bottom-35 left-1/2 z-[1002] -translate-x-1/2"
		in:fly={{ y: 16, duration: 220, opacity: 0 }}
		out:fly={{ y: 16, duration: 160, opacity: 0 }}
	>
		<div
			class="veto-popup flex min-w-72 flex-col gap-2 p-3"
		>
			<!-- 头部 -->
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2">
					<Ruler class="h-4 w-4 text-amber-500" />
					<span class="text-sm font-medium text-stone-700 dark:text-stone-200">{t('components_measure_distance')}</span>
					{#if points.length > 0}
						<Badge variant="secondary" class="h-5 px-1.5 text-[10px]">{t('components_point_count', { count: points.length })}</Badge>
					{/if}
				</div>
				<div class="flex items-center gap-1">
					{#if points.length > 0}
						<Button
							variant="ghost"
							size="icon"
							class="h-6 w-6 text-stone-400 hover:text-red-500"
							title={t('components_clear_points')}
							onclick={clearPoints}
						>
							<Trash2 class="h-3.5 w-3.5" />
						</Button>
					{/if}
					<Button
						variant="ghost"
						size="icon"
						class="h-6 w-6 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
						title={t('components_exit_measure')}
						onclick={cancel}
					>
						<X class="h-3.5 w-3.5" />
					</Button>
				</div>
			</div>

			<Separator class="dark:bg-stone-400" />

			{#if points.length === 0}
				<div class="flex items-center gap-2 py-1 text-xs text-stone-400 dark:text-stone-500">
					<MapPin class="h-3.5 w-3.5" />
					{t('components_add_measure_point')}
				</div>
			{:else}
				<!-- 各段距离列表 -->
				<div class="flex max-h-36 flex-col gap-1 overflow-y-auto">
					{#each segmentDistances as d, i}
						<div class="flex items-center justify-between rounded-md px-2 py-0.5 text-xs">
							<span class="text-stone-500 dark:text-stone-400">{t('components_segment_number', { number: i + 1 })}</span>
							<span class="font-mono font-medium text-stone-700 dark:text-stone-200"
								>{formatDist(d)}</span
							>
						</div>
					{/each}

					{#if previewDistance !== null}
						<div
							class="flex items-center justify-between rounded-md px-2 py-0.5 text-xs opacity-60"
						>
							<span class="text-amber-500">{t('components_preview_segment')}</span>
							<span class="font-mono font-medium text-amber-500">{formatDist(previewDistance)}</span
							>
						</div>
					{/if}
				</div>

				<Separator class="dark:bg-stone-700" />

				<!-- 总距离 -->
				<div class="flex items-center justify-between px-2">
					<span class="text-xs font-medium text-stone-600 dark:text-stone-300">{t('components_total_distance')}</span>
					<span class="font-mono text-sm font-bold text-amber-500">
						{formatDist(previewDistance !== null ? totalDistance + previewDistance : totalDistance)}
					</span>
				</div>
			{/if}
		</div>
	</div>
{/if}
