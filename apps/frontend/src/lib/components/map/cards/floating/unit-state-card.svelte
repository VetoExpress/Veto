<script lang="ts">
  import { t } from '$lib/i18n'
	import { currentBattle, runtimePositions } from '$lib/classes/stores/battle/battle-store';
	import { mods } from '$lib/classes/services/plugin/mod-registry.svelte';
	import { pendingRoute } from '$lib/classes/stores/battle/route.store';
	import { Button } from '$lib/components/ui/button';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { MapPin, X, Activity, GripHorizontal, Navigation } from '@lucide/svelte';

	let { open = $bindable(false) } = $props();

	// ── 拖拽状态 ──
	let pos = $state({ x: Math.max(0, window.innerWidth / 2 - 210), y: 120 });
	let dragging = $state(false);
	let dragOffset = $state({ x: 0, y: 0 });

	function onDragStart(e: MouseEvent) {
		if ((e.target as HTMLElement).closest('button')) return;
		dragging = true;
		dragOffset = { x: e.clientX - pos.x, y: e.clientY - pos.y };
		e.preventDefault();
	}

	$effect(() => {
		if (!dragging) return;
		function onMove(e: MouseEvent) {
			pos = {
				x: Math.max(0, Math.min(window.innerWidth - 420, e.clientX - dragOffset.x)),
				y: Math.max(0, Math.min(window.innerHeight - 60, e.clientY - dragOffset.y))
			};
		}
		function onUp() {
			dragging = false;
		}
		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
		return () => {
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);
		};
	});

	// ── 辅助函数 ──
	function branchLabel(branch: string): string {
		return mods.getLabel('branch.' + branch, branch);
	}

	/** 从 currentBattle 查找单位名称与所属阵营颜色 */
	function findUnitInfo(placedUnitId: string): { name: string; color: string; branch: string } | null {
		const battle = $currentBattle;
		if (!battle) return null;
		const placed = battle.placedUnits.find((p) => p.id === placedUnitId);
		if (!placed) return null;
		const faction = battle.factions.find((f) => f.id === placed.factionId);
		if (!faction) return null;
		const unit = faction.units.find((u) => u.id === placed.unitId);
		if (!unit) return null;
		return { name: unit.name, color: faction.color, branch: unit.branchId };
	}

	// 派生: 当前战局所有已放置单位列表
	const placedUnits = $derived($currentBattle?.placedUnits ?? []);
	// 交战单位数 / 待确认路线
	const engagedCount = $derived(
		Object.values($runtimePositions).filter((p) => p.isEngaged).length
	);
	const hasPendingRoute = $derived(!!$pendingRoute);

</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed z-[1500] flex w-[26rem] flex-col overflow-hidden rounded-xl border bg-background/75 backdrop-blur-md"
		style="left:{pos.x}px; top:{pos.y}px;"
	>
		<!-- 拖拽标题栏 -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="flex cursor-grab items-center gap-2 border-b border-border/60 px-4 py-2.5 select-none active:cursor-grabbing"
			onmousedown={onDragStart}
		>
			<Activity class="size-4 shrink-0 text-muted-foreground" />
			<span class="flex-1 text-sm font-semibold tracking-wide">{t('components_unit_overview')}</span>

			<!-- 状态徽标 -->
			{#if engagedCount > 0}
				<span class="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-600 dark:bg-red-900/30 dark:text-red-400">
					{t('components_engaged_count', { count: engagedCount })}
				</span>
			{/if}
			{#if hasPendingRoute}
				<span class="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
					{t('components_pending_route_icon')}
				</span>
			{/if}

			<GripHorizontal class="size-3.5 text-muted-foreground/40" />

			<Button
				variant="ghost"
				size="icon"
				class="ml-1 size-6 shrink-0 text-muted-foreground hover:text-foreground"
				onclick={() => (open = false)}
			>
				<X class="size-3.5" />
			</Button>
		</div>

		<!-- 单位列表 -->
		<ScrollArea class="max-h-[70vh]">
			{#if placedUnits.length === 0}
				<p class="py-8 text-center text-xs text-muted-foreground">{t('components_no_placed_units')}</p>
			{:else}
				<div class="divide-y divide-border/40">
					{#each placedUnits as placed (placed.id)}
						{@const rt = $runtimePositions[placed.id]}
						{@const hp = rt?.hp ?? placed.hp}
					{@const maxHp = placed.stats.maxHp}
					{@const org = rt?.org ?? placed.org}
					{@const maxOrg = placed.stats.maxOrg}
						{@const isEngaged = rt?.isEngaged ?? false}
						{@const route = rt?.route ?? placed.route}
						{@const lat = rt?.lat ?? placed.lat}
						{@const lng = rt?.lng ?? placed.lng}
						{@const info = findUnitInfo(placed.id)}
						{@const isPendingForThis = $pendingRoute?.placedId === placed.id}
						<div class="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
							<!-- 阵营色圆点 -->
							<div
								class="flex h-8 w-8 shrink-0 items-center justify-center rounded border text-xs font-bold"
								style="border-color:{isEngaged ? '#ef4444' : isPendingForThis ? '#f59e0b' : (info?.color ?? '#888')}; color:{isEngaged ? '#dc2626' : isPendingForThis ? '#b45309' : (info?.color ?? '#888')}; background:{isEngaged ? '#fef2f2' : isPendingForThis ? '#fef9ee' : (info?.color ?? '#888') + '15'};"
							>
								{#if info?.branch === 'navy'}
									⚓
								{:else if info?.branch === 'air_force'}
									✈
								{:else}
									⚔
								{/if}
							</div>

							<div class="min-w-0 flex-1">
								<!-- 名称 + 军种 + 状态标签 -->
								<div class="flex flex-wrap items-baseline gap-1.5">
									<span class="text-sm font-semibold">{info?.name ?? placed.id}</span>
									{#if info}
										<span class="text-xs text-muted-foreground">{branchLabel(info.branch)}</span>
									{/if}
									{#if hp <= 0}
										<span class="text-xs font-medium text-muted-foreground">{t('components_destroyed_skull')}</span>
									{:else if isEngaged}
									<span class="text-xs font-medium text-red-600 dark:text-red-400">{t('components_engaged_icon')}</span>
									{/if}
									{#if isPendingForThis}
									<span class="text-xs font-medium text-amber-600 dark:text-amber-400">
											<Navigation class="inline size-2.5 mr-0.5" />
											{$pendingRoute?.type === 'reset' ? t('components_route_reset_pending') : t('components_route_append_pending')}
										</span>
									{/if}
								</div>

								<!-- 坐标 / 路线节点 / 速度 -->
								<div class="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
									<span class="flex items-center gap-1">
										<MapPin class="size-2.5" />
										{lat.toFixed(3)}°N, {lng.toFixed(3)}°E
									</span>
									<span>{placed.stats.speed} km/h</span>
									{#if hp <= 0}
										<span class="text-muted-foreground/60">{t('components_combat_ineffective')}</span>
									{:else if route.length === 0}
										<span class="text-muted-foreground/60">{t('components_standing_by')}</span>
									{:else}
										<span class="text-green-600 dark:text-green-400">{t('components_remaining_waypoints', { count: route.length })}</span>
									{/if}
								</div>

								<!-- HP / 组织度进度条 -->
								<div class="mt-1.5 flex flex-col gap-1">
									<div class="flex items-center gap-1.5">
										<span class="w-6 shrink-0 text-[10px] text-muted-foreground">HP</span>
										<div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
											<div
												class="h-full rounded-full transition-all {hp / maxHp > 0.5
													? 'bg-green-400'
													: hp / maxHp > 0.25
														? 'bg-yellow-400'
														: 'bg-red-400'}"
												style="width:{(hp / maxHp) * 100}%"
											></div>
										</div>
										<span class="w-14 shrink-0 text-right font-mono text-[10px] text-muted-foreground"
											>{Math.round(hp)}/{maxHp}</span
										>
									</div>
									<div class="flex items-center gap-1.5">
										<span class="w-6 shrink-0 text-[10px] text-muted-foreground">{t('components_organization_short')}</span>
										<div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
											<div
												class="h-full rounded-full transition-all {org / maxOrg < 0.2
													? 'bg-orange-400'
													: 'bg-blue-400'}"
												style="width:{(org / maxOrg) * 100}%"
											></div>
										</div>
										<span
											class="w-14 shrink-0 text-right font-mono text-[10px] {org / maxOrg < 0.2
												? 'text-orange-500'
												: 'text-muted-foreground'}"
											>{Math.round(org)}/{maxOrg}{org / maxOrg < 0.2 ? ' ⚠' : ''}</span
										>
									</div>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</ScrollArea>
	</div>
{/if}
