<script lang="ts">
  import { t } from '$lib/i18n'
  import { Search, Plus, Clock } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { ScrollArea } from '$lib/components/ui/scroll-area/index.js'
  import * as InputGroup from '$lib/components/ui/input-group/index.js'
  import * as Card from '$lib/components/ui/card/index.js'
  import { timelines } from '$lib/classes/stores/timeline-store'
  import TimelineCard from '$lib/components/tools/timeline-card.svelte'
  import CreateTimelineDialog from '$lib/components/tools/create-timeline-dialog.svelte'
  import { cn } from '$lib/classes/utils.js'
  import { fly } from 'svelte/transition'

  interface Props {
    class?: string
  }

  let { class: className }: Props = $props()

  let query = $state('')
  let dialogOpen = $state(false)

  const filteredTimelines = $derived(
    query.trim()
      ? $timelines.filter((t) => t.name.toLowerCase().includes(query.trim().toLowerCase()))
      : $timelines
  )
</script>

<div
  class={cn('flex h-full min-w-0 flex-1 flex-col bg-background', className)}
  in:fly={{ y: 8, duration: 320, opacity: 0 }}
>
  <!-- Header -->
  <div class="grid grid-cols-3 items-center gap-6 border-b px-8 py-5">
    <div>
      <h2 class="text-xl font-semibold text-foreground">{t('components_timeline_management')}</h2>
      <p class="mt-0.5 text-sm text-muted-foreground">
        {t('components_timeline_count', { count: $timelines.length })}
      </p>
    </div>

    <!-- 搜索 -->
    <InputGroup.Root>
      <InputGroup.Input bind:value={query} placeholder={t('components_search_timeline')} />
      <InputGroup.Addon>
        <Search class="h-4 w-4" />
      </InputGroup.Addon>
    </InputGroup.Root>

    <!-- 操作 -->
    <div class="flex justify-end gap-2">
      <Button onclick={() => (dialogOpen = true)} class="gap-2">
        <Plus size={16} />
        {t('components_new_timeline')}
      </Button>
    </div>
  </div>

  <!-- Timeline List -->
  <ScrollArea class="flex-1">
    <div class="px-8 py-6">
      {#if filteredTimelines.length === 0}
        <Card.Root class="border-dashed bg-card/30 py-16 text-center shadow-none">
          <Card.Content class="p-0">
            {#if query.trim() && $timelines.length > 0}
              <p class="text-muted-foreground">{t('components_no_matching_timeline')}</p>
              <p class="mt-1 text-sm text-muted-foreground/70">{t('components_try_keywords')}</p>
            {:else}
              <div class="flex flex-col items-center gap-3">
                <Clock size={40} class="opacity-30" />
                <p class="text-muted-foreground">{t('components_no_saved_timelines')}</p>
                <p class="text-sm text-muted-foreground/70">{t('components_create_timeline_start')}</p>
              </div>
            {/if}
          </Card.Content>
        </Card.Root>
      {:else}
        <div class="flex flex-col gap-3">
          {#each filteredTimelines as tl (tl.id)}
            <TimelineCard timeline={tl} />
          {/each}
        </div>
      {/if}
    </div>
  </ScrollArea>
</div>

<!-- Create Dialog -->
<CreateTimelineDialog bind:open={dialogOpen} />
