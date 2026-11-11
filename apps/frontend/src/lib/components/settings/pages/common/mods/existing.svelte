<script lang="ts">
  import { t, formatDate } from '$lib/i18n'
	import { PackageCheck, Trash2 } from '@lucide/svelte';
	import { dbGetAllPlugins, dbDeletePlugin, dbDeletePluginAssets, installedPluginsRevision } from '$lib/classes/services/plugin/plugin-db';
	import type { InstalledPlugin } from '$lib/classes/services/plugin/plugin-db';
	import { Button } from '$lib/components/ui/button';

	let dbPlugins = $state<InstalledPlugin[]>([]);
	let rev = $state(0);
	$effect(() => installedPluginsRevision.subscribe((v) => { rev = v; }));

	$effect(() => {
		void rev;
		dbGetAllPlugins().then((p) => { dbPlugins = p; });
	});

	async function handleUninstall(plugin: InstalledPlugin) {
		await dbDeletePlugin(plugin.id);
		if (plugin.assetKeys?.length) {
			await dbDeletePluginAssets(plugin.assetKeys);
		}
	}
</script>

<div class="space-y-4">
	{#if dbPlugins.length > 0}
		<div>
			<p class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('settings_installed')}</p>
			<div class="flex flex-col gap-2">
				{#each dbPlugins as plugin (plugin.id)}
					<div class="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-3">
						<div class="flex items-center justify-between gap-2">
							<div class="min-w-0">
								<p class="truncate text-sm font-semibold text-foreground">{plugin.manifest.name}</p>
								<p class="text-xs text-muted-foreground">
									v{plugin.manifest.version} · {plugin.manifest.author}
									· {t('settings_installed_on', { date: formatDate(plugin.installedAt, { dateStyle: 'short' }) })}
								</p>
							</div>
							<Button
								variant="ghost"
								size="icon"
								class="size-7 shrink-0 text-muted-foreground hover:text-destructive"
								title={t('settings_uninstall')}
								onclick={() => handleUninstall(plugin)}
							>
								<Trash2 class="size-3.5" />
							</Button>
						</div>
						{#if plugin.manifest.description}
							<p class="text-xs text-muted-foreground">{plugin.manifest.description}</p>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{:else}
		<div class="flex min-h-60 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-stone-300 text-stone-400 dark:border-stone-700 dark:text-stone-500">
			<PackageCheck size={32} class="opacity-40" />
			<span class="text-sm">{t('settings_mod_not_installed')}</span>
			<span class="text-xs">{t('settings_mod_install_hint')}</span>
		</div>
	{/if}
</div>

