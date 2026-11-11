<script lang="ts">
  import { t } from '$lib/i18n'
  import { ExternalLink } from '@lucide/svelte'
  import * as Tabs from '$lib/components/ui/tabs/index.js'
  import { registry } from '$lib/classes/services/plugin/mod-registry.svelte'
  import AllMods from './mods/all.svelte'
  import ExistingMods from './mods/existing.svelte'
  import InstallMod from './mods/install.svelte'
  import { fly } from 'svelte/transition'

  const stats = $derived.by(() => {
    return {
      branches: registry.getBranchesSize(),
      categories: registry.getCategoriesSize(),
      templates: registry.getUnitTemplatesSize()
    }
  })
</script>

<div class="flex flex-col" in:fly={{ y: 8, duration: 320, opacity: 0 }}>
  <div class="mb-1 text-xl font-bold text-stone-800 dark:text-stone-100">{t('settings_mod_management')}</div>
  <p class="mb-4 text-sm text-muted-foreground">
    {t('settings_mod_description')}
    <a
      href="https://github.com/VetoExpress/veto-plugins"
      target="_blank"
      rel="noreferrer"
      class="inline-flex items-center gap-1 text-stone-600 underline underline-offset-2 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200"
    >
      {t('settings_mod_community')} <ExternalLink size={11} />
    </a>
  </p>

  <!-- 统计栏 -->
  <div class="mb-4 grid grid-cols-3 gap-2">
    {#each [{ key: 'branches', label: t('settings_branches'), value: stats.branches }, { key: 'categories', label: t('settings_categories'), value: stats.categories }, { key: 'templates', label: t('settings_templates'), value: stats.templates }] as stat (stat.key)}
      <div class="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-center">
        <div class="text-lg font-bold text-foreground">{stat.value}</div>
        <div class="text-xs text-muted-foreground">{stat.label}</div>
      </div>
    {/each}
  </div>

  <Tabs.Root value="all">
    <Tabs.List>
      <Tabs.Trigger value="all">{t('settings_all')}</Tabs.Trigger>
      <Tabs.Trigger value="installed">{t('settings_installed')}</Tabs.Trigger>
      <Tabs.Trigger value="install">{t('settings_install')}</Tabs.Trigger>
    </Tabs.List>

    <Tabs.Content value="all">
      <AllMods />
    </Tabs.Content>

    <Tabs.Content value="installed">
      <ExistingMods />
    </Tabs.Content>

    <Tabs.Content value="install">
      <InstallMod />
    </Tabs.Content>
  </Tabs.Root>
</div>
