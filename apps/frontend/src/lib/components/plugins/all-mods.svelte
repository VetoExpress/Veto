<script lang="ts">
  import { t } from '$lib/i18n'
  import { Puzzle } from '@lucide/svelte'
  import { registry } from '$lib/classes/services/plugin/mod-registry.svelte'
  import ModCard from './mod-card.svelte'

  // 直接从 registry 获取响应式列表
  const modList = $derived(registry.getModList())

  // 按来源分类
  const userMods = $derived(modList.filter((m) => m.metadata?.source === 'user'))
  const systemMods = $derived(modList.filter((m) => m.metadata?.source === 'system'))
</script>

<div class="space-y-4">
  <!--系统内置-->
  <div>
    <p class="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
      {t('settings_builtin')}
    </p>
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {#each systemMods as entry (entry.id)}
        <ModCard {entry} />
      {/each}
    </div>
  </div>

  {#if userMods.length > 0}
    <div>
      <p class="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {t('settings_user_installed')}
      </p>
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {#each userMods as entry (entry.id || entry.metadata?.id || JSON.stringify(entry))}
          <ModCard {entry} />
        {/each}
      </div>
    </div>
  {/if}

  {#if modList.length === 0}
    <div
      class="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-stone-300 py-16 text-stone-400 dark:border-stone-700 dark:text-stone-500"
    >
      <Puzzle size={32} class="opacity-40" />
      <span class="text-sm">{t('settings_mod_empty')}</span>
    </div>
  {/if}
</div>
