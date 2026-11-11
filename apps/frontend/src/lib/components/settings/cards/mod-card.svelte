<script lang="ts">
  import { t } from '$lib/i18n'
  import { Package, ShieldCheck, User } from '@lucide/svelte'
  import type { ModData } from '$lib/classes/types/battle'
  import { registry } from '$lib/classes/services/plugin/mod-registry.svelte'
  import { Badge } from '$lib/components/ui/badge'

  let {
    entry
  }: {
    entry: ModData
  } = $props()

  $effect(() => {
    console.log('[ModCard] render:', entry.id, entry.metadata?.source)
  })

  const systemSource = $derived(entry.metadata?.source === 'system')
</script>

<div
  class="flex flex-col gap-3 rounded-lg border border-border bg-card p-5 transition-opacity {!systemSource
    ? 'opacity-50'
    : ''}"
>
  <!-- 标题行 -->
  <div class="flex items-start justify-between gap-3">
    <div class="flex min-w-0 items-center gap-2.5">
      <div
        class="flex size-9 shrink-0 items-center justify-center rounded-md {systemSource
          ? 'bg-primary/10 text-primary'
          : 'bg-muted text-muted-foreground'}"
      >
        {#if systemSource}
          <ShieldCheck class="size-4" />
        {:else}
          <Package class="size-4" />
        {/if}
      </div>
      <div class="min-w-0">
        <div class="flex items-center gap-1.5">
          <span class="truncate text-sm font-semibold text-foreground"
            >{entry.metadata?.name ?? entry.metadata?.id ?? t('settings_unknown_mod')}</span
          >
          {#if systemSource}
            <Badge variant="secondary" class="shrink-0 text-[10px]">{t('settings_system')}</Badge>
          {/if}
        </div>
        <div class="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          {#if entry.metadata?.version}
            <span>v{entry.metadata.version}</span>
          {/if}
          {#if entry.metadata?.author}
            <span class="flex items-center gap-0.5">
              <User class="size-3" />{entry.metadata.author}
            </span>
          {/if}
          {#if !entry.metadata?.version && !entry.metadata?.author}
            <span class="italic">{t('settings_no_version')}</span>
          {/if}
        </div>
      </div>
    </div>
  </div>

  <!-- 描述 -->
  {#if entry.metadata?.description}
    <p class="text-xs leading-relaxed text-muted-foreground">{entry.metadata.description}</p>
  {/if}

  <!-- 统计标签 -->
  {#if (entry.branches?.length ?? 0) + (entry.categories?.length ?? 0) + (entry.unitTemplates?.length ?? 0) > 0}
    {@const branchCount = entry.branches?.length ?? 0}
    {@const categoryCount = entry.categories?.length ?? 0}
    {@const templateCount = entry.unitTemplates?.length ?? 0}
    <div class="flex flex-wrap gap-1.5">
      {#if branchCount > 0}
        <span
          class="rounded-md border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground"
          >{t('settings_branch_count', { count: branchCount })}</span
        >
      {/if}
      {#if categoryCount > 0}
        <span
          class="rounded-md border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground"
          >{t('settings_category_count', { count: categoryCount })}</span
        >
      {/if}
      {#if templateCount > 0}
        <span
          class="rounded-md border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground"
          >{t('settings_template_count', { count: templateCount })}</span
        >
      {/if}
    </div>
  {/if}
</div>
