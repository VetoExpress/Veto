<script lang="ts">
  import { t } from '$lib/i18n'
	import { Tabs } from 'bits-ui';
	import { registry, mods } from '$lib/classes/services/plugin/mod-registry.svelte';
	import { cn } from '$lib/classes/utils';

	let {
		value,
		onchange,
		orientation = 'horizontal'
	}: {
		value: string;
		onchange: (branchId: string) => void;
		orientation?: 'horizontal' | 'vertical';
	} = $props();

	// 从注册表动态获取所有军种，响应 registry 变化
	const branches = $derived.by(() => {
		const allBranches = new Map<string, any>();

		for (const mod of mods.getModList()) {
			if (mod.branches) {
				for (const branch of mod.branches) {
					allBranches.set(branch.id, branch);
				}
			}
		}
		return [...allBranches.values()];
	});

	$effect(() => {
		console.log('BranchSelector branches:', branches);
	});
</script>

<Tabs.Root
	{value}
	onValueChange={(v) => onchange(v)}
	class={cn(
		orientation === 'vertical' ? 'flex-col' : 'flex-row',
		'flex items-stretch'
	)}
>
	<Tabs.List
		class={cn(
			'flex rounded-lg bg-muted p-1',
			orientation === 'vertical' ? 'h-auto w-full flex-col gap-0.5' : 'h-8 w-full flex-row'
		)}
		aria-label={t('components_branch_selector')}
	>
		{#each branches as branch (branch.id)}
			<Tabs.Trigger
				value={branch.id}
				class={cn(
					'rounded-md px-2 py-1 text-xs font-medium transition-colors',
					'text-muted-foreground hover:text-foreground',
					'data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
					orientation === 'vertical' ? 'w-full text-left' : 'flex-1'
				)}
			>
				{mods.getLabel('branch.' + branch.id, branch.id)}
			</Tabs.Trigger>
		{/each}
	</Tabs.List>
</Tabs.Root>
