<script lang="ts">
  import { t } from '$lib/i18n'
  import SwordsIcon from '@lucide/svelte/icons/swords'
  import ScaleIcon from '@lucide/svelte/icons/scale'
  import ExternalLinkIcon from '@lucide/svelte/icons/external-link'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import type { PluginManifest } from '$lib/classes/services/plugin/plugin-db'

  interface Props {
    manifest: PluginManifest
  }

  let { manifest }: Props = $props()
</script>

<!-- 名称 + 元信息 -->
<div class="mb-4 flex items-start gap-3">
  <div
    class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl
      bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
  >
    <SwordsIcon size={22} />
  </div>
  <div class="min-w-0">
    <h2 class="text-xl font-bold tracking-tight">
      {manifest.name}
    </h2>
    <div class="mt-2 flex flex-wrap items-center gap-1.5">
      <Badge variant="secondary" class="text-[10px]">
        {manifest.author}
      </Badge>
      <Badge variant="secondary" class="text-[10px]">
        v{manifest.version}
      </Badge>
      {#if manifest.license}
        <Badge variant="outline" class="text-[10px]">
          <ScaleIcon size={10} class="mr-0.5" />
          {manifest.license}
        </Badge>
      {/if}
      {#if manifest.repo}
        <Badge variant="outline" class="text-[10px]">
          <ExternalLinkIcon size={10} class="mr-0.5" />
          {t('settings_repository')}
        </Badge>
      {/if}
    </div>
  </div>
</div>

<!-- 头图 -->
{#if manifest.banner}
  <div
    class="mb-4 overflow-hidden rounded-xl border border-stone-200
      dark:border-stone-700"
  >
    <img
      src={manifest.banner}
      alt={manifest.name}
      class="w-full object-cover"
      style="max-height: 240px;"
    />
  </div>
{/if}

<!-- 简介 -->
{#if manifest.description}
  <p class="text-sm leading-relaxed text-muted-foreground">
    {manifest.description}
  </p>
{:else}
  <p class="text-sm italic text-muted-foreground/60">{t('settings_no_description')}</p>
{/if}
