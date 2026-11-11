<script lang="ts">
  import { t, formatNumber } from '$lib/i18n'
	import type { UnitTemplate, PlacedUnit, Faction } from '$lib/classes/types/battle';
	import { mods } from '$lib/classes/services/plugin/mod-registry.svelte';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import {
		Heart,
		Zap,
		Swords,
		Wrench,
		PlaneTakeoff,
		ShieldHalf,
		Gauge,
		MapPin
	} from '@lucide/svelte';
	import NatoSymbol from '../../nato-symbol.svelte';
	import { runtimePositions } from '$lib/classes/stores/battle/battle-store';

	let { unit, faction, placed }: { unit: UnitTemplate; faction: Faction; placed: PlacedUnit } =
		$props();

	// 解析北约功能代码（placed.natoCode 可覆盖模板）
	const natoCode = $derived<string>(placed.natoCode ?? mods.getNatoCode(unit));
	const side = $derived<string>(faction.side ?? 'blue');

	const liveRt = $derived($runtimePositions[placed.id]);
	const liveHp = $derived(liveRt?.hp ?? placed.hp);
	const liveOrg = $derived(liveRt?.org ?? placed.org);
	const liveStatus = $derived(liveRt?.status ?? placed.status);

	const maxHp = $derived(placed.stats['maxHp'] ?? 1);
	const maxOrg = $derived(placed.stats['maxOrg'] ?? 1);
	const hpPct = $derived(maxHp > 0 ? (liveHp / maxHp) * 100 : 100);
	const orgPct = $derived(maxOrg > 0 ? (liveOrg / maxOrg) * 100 : 100);
	const hpBarClass = $derived(
		hpPct > 50 ? 'bg-green-500' : hpPct > 25 ? 'bg-amber-400' : 'bg-red-500'
	);

	// 大类显示标签
	const categoryLabel = $derived(mods.getLabel('category.' + unit.categoryId, unit.categoryId));
</script>

<div class="min-w-56 py-1 font-sans">
	<!-- ── 标题区：北约图标 + 名称 ── -->
	<div class="flex items-center gap-3 pb-2">
		<div class="flex-shrink-0 drop-shadow-md">
			<NatoSymbol {natoCode} {side} size={52} color={faction.color} />
		</div>
		<div class="min-w-0 flex-1">
			<p class="truncate text-sm font-bold leading-tight text-foreground">{unit.name}</p>
			<div class="mt-0.5 flex items-center gap-1.5">
				<span
					class="inline-block h-2 w-2 flex-shrink-0 rounded-full"
					style="background: {faction.color};"
				></span>
				<span class="truncate text-xs text-stone-500">
					{faction.name} · {mods.getLabel('branch.' + unit.branchId, unit.branchId)}
				</span>
			</div>
			<p class="mt-0.5 text-[10px] font-medium text-muted-foreground">
				{categoryLabel}
			</p>
		</div>
	</div>

	<!-- ── HP & 组织度 ── -->
	<div class="flex flex-col gap-1.5 rounded-md bg-stone-50 px-2 py-2 dark:bg-stone-800/60">
		<!-- HP -->
		<div class="flex items-center gap-2">
			<Heart class="h-3.5 w-3.5 flex-shrink-0 text-rose-500 dark:text-rose-400" />
			<div class="flex flex-1 flex-col gap-0.5">
				<div class="flex items-center justify-between">
					<span class="text-[10px] font-medium text-muted-foreground">{t('components_health')}</span>
					<span class="font-mono text-[10px] text-muted-foreground"
						>{Math.round(liveHp)}/{maxHp}</span
					>
				</div>
				<div class="h-1.5 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
					<div class="h-1.5 rounded-full transition-all {hpBarClass}" style="width:{hpPct}%;"></div>
				</div>
			</div>
		</div>
		<!-- 组织度 -->
		<div class="flex items-center gap-2">
			<Zap class="h-3.5 w-3.5 flex-shrink-0 text-amber-500 dark:text-amber-400" />
			<div class="flex flex-1 flex-col gap-0.5">
				<div class="flex items-center justify-between">
					<span class="text-[10px] font-medium text-muted-foreground">{t('components_organization')}</span>
					<span class="font-mono text-[10px] text-muted-foreground"
						>{Math.round(liveOrg)}/{maxOrg}</span
					>
				</div>
				<div class="h-1.5 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
					<div
						class="h-1.5 rounded-full bg-amber-400 transition-all dark:bg-amber-500"
						style="width:{orgPct}%;"
					></div>
				</div>
			</div>
		</div>
	</div>

	<Separator class="my-2" />

	<!-- ── 攻防数值表 ── -->
	<div class="grid grid-cols-2 gap-x-3 gap-y-1.5">
		<div class="flex items-center gap-1.5">
			<Swords class="h-3 w-3 flex-shrink-0 text-orange-500" />
			<span class="text-[10px] text-muted-foreground">{t('components_soft_attack')}</span>
			<span class="ml-auto font-mono text-[10px] font-semibold text-foreground"
				>{placed.stats['softAttack'] ?? 0}</span
			>
		</div>
		<div class="flex items-center gap-1.5">
			<Wrench class="h-3 w-3 flex-shrink-0 text-zinc-500" />
			<span class="text-[10px] text-muted-foreground">{t('components_hard_attack')}</span>
			<span class="ml-auto font-mono text-[10px] font-semibold text-foreground"
				>{placed.stats['hardAttack'] ?? 0}</span
			>
		</div>
		<div class="flex items-center gap-1.5">
			<PlaneTakeoff class="h-3 w-3 flex-shrink-0 text-sky-500" />
			<span class="text-[10px] text-muted-foreground">{t('components_air_attack')}</span>
			<span class="ml-auto font-mono text-[10px] font-semibold text-foreground"
				>{placed.stats['airAttack'] ?? 0}</span
			>
		</div>
		<div class="flex items-center gap-1.5">
			<ShieldHalf class="h-3 w-3 flex-shrink-0 text-blue-500" />
			<span class="text-[10px] text-muted-foreground">{t('components_defense')}</span>
			<span class="ml-auto font-mono text-[10px] font-semibold text-foreground"
				>{placed.stats['defense'] ?? 0}</span
			>
		</div>
		<div class="col-span-2 flex items-center gap-1.5">
			<Gauge class="h-3 w-3 flex-shrink-0 text-green-500" />
			<span class="text-[10px] text-muted-foreground">{t('components_speed')}</span>
			<span class="ml-auto font-mono text-[10px] font-semibold text-foreground"
				>{placed.stats['speed'] ?? 0} km/h</span
			>
		</div>
	</div>

	<Separator class="my-2" />

	<!-- ── 状态 & 坐标 ── -->
	<div class="flex flex-col gap-1">
		<div class="flex items-center justify-between gap-4">
			<span class="text-xs text-muted-foreground">{t('components_status')}</span>
			<span class="text-xs font-medium text-foreground">
			{mods.getLabel('status.' + liveStatus, liveStatus)}</span>
		</div>
		<div class="flex items-center justify-between gap-4">
			<MapPin class="h-3 w-3 text-muted-foreground/50" />
			<span class="font-mono text-xs text-muted-foreground"
        >{formatNumber(placed.lat, { minimumFractionDigits: 4, maximumFractionDigits: 4, useGrouping: false })}°, {formatNumber(placed.lng, { minimumFractionDigits: 4, maximumFractionDigits: 4, useGrouping: false })}°</span
			>
		</div>
	</div>
</div>

