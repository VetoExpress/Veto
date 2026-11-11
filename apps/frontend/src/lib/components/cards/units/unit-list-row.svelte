<script lang="ts">
  import { t } from '$lib/i18n'
	import type { UnitTemplate, PlacedUnit } from '$lib/classes/types/battle';
	import type { RuntimeUnitPosition } from '$lib/classes/stores/battle/battle-store';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Trash2, MapPin, Crosshair, Pencil, Check, X } from '@lucide/svelte';

	let {
		unit,
		isSelected = false,
		placed,
		runtimePos,
		onSelect,
		onLocate,
		onPlace,
		onDelete,
		onRename
	}: {
		unit: UnitTemplate;
		isSelected?: boolean;
		placed?: PlacedUnit;
		runtimePos?: RuntimeUnitPosition;
		onSelect: () => void;
		onLocate: () => void;
		onPlace: () => void;
		onDelete: () => void;
		onRename: (name: string) => void;
	} = $props();

	let renaming = $state(false);
	let renameValue = $state('');

	const hp = $derived(runtimePos?.hp ?? placed?.hp ?? null);
	const maxHp = $derived(placed?.stats.maxHp ?? null);
	const org = $derived(runtimePos?.org ?? placed?.org ?? null);
	const maxOrg = $derived(placed?.stats.maxOrg ?? null);
	const isEngaged = $derived(runtimePos?.isEngaged ?? false);
	const isDestroyed = $derived(
		runtimePos
			? runtimePos.status === 'destroyed' || runtimePos.hp <= 0
			: placed != null && (placed.status === 'destroyed' || placed.hp <= 0)
	);

	function startRename() {
		renameValue = unit.name;
		renaming = true;
	}

	function saveRename() {
		const name = renameValue.trim();
		if (name) onRename(name);
		renaming = false;
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="flex cursor-pointer items-start justify-between rounded-md px-2 py-1.5 text-sm transition-colors {isSelected
		? 'bg-muted'
		: 'hover:bg-muted/60'}"
	onclick={onSelect}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') onSelect();
	}}
	role="button"
	tabindex="0"
>
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="min-w-0 flex-1" >
		<!-- 单位名称 / 重命名 Input -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="flex items-center gap-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
			{#if renaming}
				<Input
					class="h-6 flex-1 text-xs"
					bind:value={renameValue}
					onkeydown={(e: KeyboardEvent) => {
						if (e.key === 'Enter') saveRename();
						if (e.key === 'Escape') renaming = false;
					}}
				/>
				<Button variant="ghost" size="icon-xs" class="size-5" onclick={saveRename}>
					<Check class="size-3" />
				</Button>
				<Button variant="ghost" size="icon-xs" class="size-5" onclick={() => (renaming = false)}>
					<X class="size-3" />
				</Button>
			{:else}
				<span class="truncate text-sm font-medium">{unit.name}</span>
				<Button
					variant="ghost"
					size="icon-xs"
					class="ml-0.5 size-5 shrink-0 text-muted-foreground/40 hover:text-foreground"
					onclick={startRename}
				>
					<Pencil class="size-3" />
				</Button>
			{/if}
		</div>

		<!-- 已放置：HP / 组织度条 + 状态 -->
		{#if placed && hp !== null && maxHp !== null}
			<div class="mt-1 flex flex-col gap-0.5">
				<div class="flex items-center gap-1">
					<span class="w-4 shrink-0 text-[9px] text-muted-foreground">HP</span>
					<div class="h-1 flex-1 overflow-hidden rounded-full bg-muted">
						<div
							class="h-full rounded-full {hp / maxHp > 0.5
								? 'bg-green-400'
								: hp / maxHp > 0.25
									? 'bg-yellow-400'
									: 'bg-red-400'}"
							style="width:{(hp / maxHp) * 100}%"
						></div>
					</div>
					<span class="w-10 shrink-0 text-right font-mono text-[9px] text-muted-foreground"
						>{Math.round(hp)}/{maxHp}</span
					>
				</div>
				{#if org !== null && maxOrg !== null}
					<div class="flex items-center gap-1">
						<span class="w-4 shrink-0 text-[9px] text-muted-foreground">{t('components_organization_short')}</span>
						<div class="h-1 flex-1 overflow-hidden rounded-full bg-muted">
							<div
								class="h-full rounded-full {org / maxOrg < 0.2 ? 'bg-orange-400' : 'bg-blue-400'}"
								style="width:{(org / maxOrg) * 100}%"
							></div>
						</div>
						<span
							class="w-10 shrink-0 text-right font-mono text-[9px] {org / maxOrg < 0.2
								? 'text-orange-500 dark:text-orange-400'
								: 'text-muted-foreground'}">{Math.round(org)}/{maxOrg}</span
						>
					</div>
				{/if}
				{#if isDestroyed}
					<span class="text-[9px] font-medium text-red-500">{t('components_destroyed_cross')}</span>
				{:else if isEngaged}
					<span class="text-[9px] font-medium text-red-600 dark:text-red-400">{t('components_engaged_icon')}</span>
				{/if}
			</div>
		{/if}
	</div>

	<!-- 操作按钮 -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="ml-1 flex shrink-0 items-center gap-0.5 pt-0.5"
		onclick={(e) => e.stopPropagation()}
		onkeydown={() => {}}
	>
		{#if !isDestroyed}
			{#if placed}
				<Button
					variant="ghost"
					size="icon-sm"
					title={t('components_locate_map')}
					class="size-6 text-muted-foreground hover:text-blue-500"
					onclick={onLocate}
				>
					<Crosshair class="size-3.5" />
				</Button>
			{:else}
				<Button
					variant="ghost"
					size="icon-sm"
					title={t('components_place_map')}
					class="size-6 text-muted-foreground hover:text-green-600"
					onclick={onPlace}
				>
					<MapPin class="size-3.5" />
				</Button>
			{/if}
		{/if}
		<Button
			variant="ghost"
			size="icon-sm"
			title={t('components_delete')}
			class="size-6 text-muted-foreground hover:text-destructive"
			onclick={onDelete}
		>
			<Trash2 class="size-3.5" />
		</Button>
	</div>
</div>
