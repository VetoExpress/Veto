<script lang="ts">
  import { t, formatNumber } from '$lib/i18n'
  import { onMount } from 'svelte'
  import { ExternalLink, Monitor, Package, PackageCheck, Plus } from '@lucide/svelte'
  import AppPage from '$lib/components/page-shell/app-page.svelte'
  import AppPageHeader from '$lib/components/page-shell/app-page-header.svelte'
  import { Button } from '$lib/components/ui/button'
  import * as Alert from '$lib/components/ui/alert'
  import * as Tabs from '$lib/components/ui/tabs/index.js'
  import { registry } from '$lib/classes/services/plugin/mod-registry.svelte'
  import { isElectron } from '$lib/classes/utils/runtime'
  import AllMods from './all-mods.svelte'
  import ExistingMods from './installed-mods.svelte'
  import InstallMod from './install-mod.svelte'

  let activeTab = $state('all')
  let desktopAvailable = $state(false)
  let mounted = $state(false)

  onMount(() => {
    desktopAvailable = isElectron()
    mounted = true
  })

  const stats = $derived([
    { label: t('settings_branches'), value: registry.getBranchesSize() },
    { label: t('settings_categories'), value: registry.getCategoriesSize() },
    { label: t('settings_templates'), value: registry.getUnitTemplatesSize() }
  ])
</script>

<AppPage>
  <AppPageHeader title={t('procedure_plugins')} description={t('settings_mod_description')}>
    <Button
      class="self-start sm:self-center"
      disabled={!desktopAvailable}
      onclick={() => (activeTab = 'install')}
    >
      <Plus data-icon="inline-start" />
      {t('settings_plugin_add')}
    </Button>
  </AppPageHeader>

  <div
    class="flex flex-col gap-5 rounded-xl border bg-card px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
  >
    <dl class="grid grid-cols-3 gap-6 sm:gap-10">
      {#each stats as stat (stat.label)}
        <div class="flex flex-col gap-1">
          <dt class="text-xs text-muted-foreground">{stat.label}</dt>
          <dd class="text-xl font-semibold tabular-nums tracking-tight">
            {formatNumber(stat.value)}
          </dd>
        </div>
      {/each}
    </dl>
    <Button
      variant="ghost"
      size="sm"
      class="self-start sm:self-center"
      href="https://github.com/VetoExpress/veto-plugins"
      target="_blank"
      rel="noreferrer"
    >
      {t('settings_mod_community')}
      <ExternalLink data-icon="inline-end" />
    </Button>
  </div>

  {#if mounted && !desktopAvailable}
    <Alert.Root>
      <Monitor />
      <Alert.Title>{t('settings_plugins_desktop_title')}</Alert.Title>
      <Alert.Description>{t('settings_plugins_desktop_description')}</Alert.Description>
    </Alert.Root>
  {/if}

  <Tabs.Root bind:value={activeTab} class="flex min-w-0 flex-col gap-6">
    <Tabs.List class="w-full flex-row gap-1 sm:w-fit">
      <Tabs.Trigger value="all" class="px-3 py-2 sm:px-5">
        <Package class="hidden sm:block" />{t('settings_all')}
      </Tabs.Trigger>
      <Tabs.Trigger value="installed" disabled={!desktopAvailable} class="px-3 py-2 sm:px-5">
        <PackageCheck class="hidden sm:block" />{t('settings_installed')}
      </Tabs.Trigger>
      <Tabs.Trigger value="install" disabled={!desktopAvailable} class="px-3 py-2 sm:px-5">
        <Plus class="hidden sm:block" />{t('settings_install')}
      </Tabs.Trigger>
    </Tabs.List>

    <Tabs.Content value="all" class="mt-0">
      <AllMods />
    </Tabs.Content>

    {#if desktopAvailable}
      <Tabs.Content value="installed" class="mt-0">
        <ExistingMods />
      </Tabs.Content>

      <Tabs.Content value="install" class="mt-0">
        <InstallMod />
      </Tabs.Content>
    {/if}
  </Tabs.Root>
</AppPage>
