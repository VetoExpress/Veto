<script lang="ts">
  import { t } from '$lib/i18n'
	import { fly } from 'svelte/transition';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { ScrollArea } from '$lib/components/ui/scroll-area';

	import type { EventSetting } from '$lib/classes/types/battle';
	import { Zap, X, Plus } from '@lucide/svelte';
	import EventCard from '$lib/components/settings/cards/event-card.svelte';
	import { cn } from '$lib/classes/utils.js';

	const PRESET_IDS = new Set([
		'natural_disaster',
		'refugee_crisis',
		'electronic_warfare',
		'local_conflict',
		'supply_disruption',
		'civilian_uprising'
	]);

	let {
		open = $bindable(false),
		eventSettings = $bindable<EventSetting[]>([]),
		containerClass = ''
	}: {
		open: boolean;
		eventSettings: EventSetting[];
		containerClass?: string;
	} = $props();

	let localDraft = $state<EventSetting[]>([]);
	let newLabel = $state('');
	let newProbability = $state(50);

	$effect(() => {
		if (open) {
			localDraft = eventSettings.map((e) => ({ ...e }));
			newLabel = '';
			newProbability = 50;
		}
	});

	function close() {
		open = false;
	}

	function handleApply() {
		eventSettings = localDraft.map((e) => ({ ...e }));
		close();
	}

	function addCustomEvent() {
		const label = newLabel.trim();
		if (!label) return;
		localDraft = [
			...localDraft,
			{ id: `custom_${Date.now()}`, label, enabled: true, probability: newProbability }
		];
		newLabel = '';
		newProbability = 50;
	}

	function deleteEvent(id: string) {
		localDraft = localDraft.filter((e) => e.id !== id);
	}

	const enabledCount = $derived(localDraft.filter((e) => e.enabled).length);
</script>

{#if open}
	<div
		transition:fly={{ x: -180, duration: 280 }}
		class={cn(
			'flex flex-col overflow-hidden rounded-xl border bg-background/100 shadow-xl',
			containerClass
		)}
	>
		<!-- 头部 -->
		<div class="flex shrink-0 items-center justify-between px-5 py-4">
			<div class="flex items-center gap-2.5">
				<Zap size={15} class="shrink-0 text-amber-500" />
				<div>
					<p class="text-sm font-semibold">{t('components_event_config')}</p>
					<p class="text-xs text-muted-foreground">
						{t('components_enabled_events', { enabled: enabledCount, total: localDraft.length })}
					</p>
				</div>
			</div>
      <Button variant="ghost" size="icon" class="h-7 w-7 shrink-0" onclick={close} aria-label={t('components_close')}>
				<X size={14} />
			</Button>
		</div>

		<Separator />

		<!-- 事件列表 -->
		<div class="scrollbar min-h-0 flex-1 overflow-y-auto">
			<ScrollArea class="flex flex-col gap-2 px-4 py-3">
				{#each localDraft as _, i (localDraft[i].id)}
					<EventCard
						bind:event={localDraft[i]}
						canDelete={!PRESET_IDS.has(localDraft[i].id)}
						ondelete={() => deleteEvent(localDraft[i].id)}
					/>
				{/each}

				<!-- 新增自定义事件 -->
				<Card.Root class="mt-1 border-dashed shadow-none">
					<Card.Header class="pb-2">
						<Card.Title class="text-xs font-medium tracking-wider text-muted-foreground uppercase">
							{t('components_custom_event')}
						</Card.Title>
					</Card.Header>
					<Card.Content class="flex flex-col gap-3">
						<Input
							placeholder={t('components_event_name')}
							bind:value={newLabel}
							class="h-8 text-sm"
							onkeydown={(e: KeyboardEvent) => {
								if (e.key === 'Enter') addCustomEvent();
							}}
						/>
						<div class="space-y-1.5">
							<div class="flex items-center justify-between">
								<Label class="text-xs text-muted-foreground">{t('components_initial_probability')}</Label>
								<span
									class="font-mono text-xs font-semibold text-amber-600 tabular-nums dark:text-amber-400"
								>
									{newProbability}%
								</span>
							</div>
							<input
								type="range"
								min="0"
								max="100"
								step="5"
								bind:value={newProbability}
								style="--val: {newProbability}%"
								class="prob-slider w-full cursor-pointer"
							/>
						</div>
						<Button
							variant="outline"
							size="sm"
							class="h-8 w-full gap-1.5 text-xs"
							onclick={addCustomEvent}
							disabled={!newLabel.trim()}
						>
							<Plus size={13} />
							{t('components_add_event')}
						</Button>
					</Card.Content>
				</Card.Root>
			</ScrollArea>
		</div>

		<Separator />

		<!-- 底部操作 -->
		<div class="flex shrink-0 gap-2 bg-background/100 px-4 py-3">
			<Button variant="outline" class="flex-1" onclick={close}>{t('components_cancel')}</Button>
			<Button class="flex-1" onclick={handleApply}>{t('components_apply_events')}</Button>
		</div>
	</div>
{/if}

<style>
	.scrollbar {
		scrollbar-width: thin;
		scrollbar-color: hsl(var(--border)) transparent;
	}
	.scrollbar::-webkit-scrollbar {
		width: 4px;
	}
	.scrollbar::-webkit-scrollbar-track {
		background: transparent;
	}
	.scrollbar::-webkit-scrollbar-thumb {
		background-color: hsl(var(--border));
		border-radius: 9999px;
	}
	.scrollbar::-webkit-scrollbar-thumb:hover {
		background-color: hsl(var(--muted-foreground) / 0.5);
	}
</style>
