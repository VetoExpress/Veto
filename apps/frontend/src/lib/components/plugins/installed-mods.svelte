<script lang="ts">
  import { t, formatDate } from '$lib/i18n'
  import { AlertCircle, Loader, PackageCheck, Trash2 } from '@lucide/svelte'
  import {
    dbGetAllPlugins,
    dbDeletePlugin,
    dbDeletePluginAssets,
    installedPluginsRevision
  } from '$lib/classes/services/plugin/plugin-db'
  import type { InstalledPlugin } from '$lib/classes/services/plugin/plugin-db'
  import { Button } from '$lib/components/ui/button'
  import * as Alert from '$lib/components/ui/alert'
  import * as Empty from '$lib/components/ui/empty'
  import { createLogger } from '$lib/classes/logger'

  const log = createLogger('plugin-manager')
  let dbPlugins = $state<InstalledPlugin[]>([])
  let loading = $state(true)
  let deletingId = $state<string | null>(null)
  let errorAction = $state<'load' | 'uninstall' | null>(null)

  $effect(() => {
    void $installedPluginsRevision
    let cancelled = false
    loading = true
    dbGetAllPlugins()
      .then((plugins) => {
        if (!cancelled) dbPlugins = plugins
      })
      .catch((error) => {
        log.error('Loading installed plugins failed; the list could not be refreshed', error)
        if (!cancelled) errorAction = 'load'
      })
      .finally(() => {
        if (!cancelled) loading = false
      })
    return () => {
      cancelled = true
    }
  })

  async function handleUninstall(plugin: InstalledPlugin) {
    if (deletingId) return
    deletingId = plugin.id
    errorAction = null
    try {
      await dbDeletePlugin(plugin.id)
      if (plugin.assetKeys?.length) {
        await dbDeletePluginAssets(plugin.assetKeys)
      }
    } catch (error) {
      log.error('Uninstalling plugin failed; removal may be incomplete', {
        pluginId: plugin.id,
        error
      })
      errorAction = 'uninstall'
    } finally {
      deletingId = null
    }
  }
</script>

<div class="flex flex-col gap-4" aria-busy={loading}>
  {#if errorAction}
    <Alert.Root variant="destructive">
      <AlertCircle />
      <Alert.Title>
        {t(
          errorAction === 'load'
            ? 'settings_plugins_load_failed'
            : 'settings_plugins_uninstall_failed'
        )}
      </Alert.Title>
    </Alert.Root>
  {/if}
  {#if loading && dbPlugins.length === 0}
    <div
      role="status"
      class="flex min-h-60 items-center justify-center gap-2 text-sm text-muted-foreground"
    >
      <Loader class="size-4 animate-spin" />{t('procedure_loading')}
    </div>
  {:else if dbPlugins.length > 0}
    <div>
      <p class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t('settings_installed')}
      </p>
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {#each dbPlugins as plugin (plugin.id)}
          <div class="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-5">
            <div class="flex items-center justify-between gap-2">
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-foreground">{plugin.manifest.name}</p>
                <p class="mt-1 break-words text-xs leading-relaxed text-muted-foreground">
                  v{plugin.manifest.version} · {plugin.manifest.author}
                  · {t('settings_installed_on', {
                    date: formatDate(plugin.installedAt, { dateStyle: 'short' })
                  })}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                class="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                title={t('settings_uninstall')}
                aria-label={t('settings_uninstall')}
                disabled={deletingId !== null}
                onclick={() => handleUninstall(plugin)}
              >
                {#if deletingId === plugin.id}
                  <Loader class="animate-spin" />
                {:else}
                  <Trash2 />
                {/if}
              </Button>
            </div>
            {#if plugin.manifest.description}
              <p class="break-words text-sm leading-relaxed text-muted-foreground">
                {plugin.manifest.description}
              </p>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {:else if !errorAction}
    <Empty.Root class="min-h-64 rounded-xl border border-dashed bg-card">
      <Empty.Header>
        <Empty.Media variant="icon"><PackageCheck /></Empty.Media>
        <Empty.Title>{t('settings_mod_not_installed')}</Empty.Title>
        <Empty.Description>{t('settings_mod_install_hint')}</Empty.Description>
      </Empty.Header>
    </Empty.Root>
  {/if}
</div>
