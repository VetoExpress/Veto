<script lang="ts">
  import { t } from '$lib/i18n'
  import { MapPin, Navigation, X, Target, Ruler, Crosshair } from '@lucide/svelte'
  import * as Kbd from '$lib/components/ui/kbd/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { interactionMode, pendingPlaceUnitId } from '$lib/classes/stores/battle/battle-store'
  import { pendingRoute, routeInsertMode } from '$lib/classes/stores/battle/route.store'
  import { fly } from 'svelte/transition'

  let {
    strikePendingTarget
  }: {
    strikePendingTarget: { lat: number; lng: number } | null
  } = $props()
</script>

{#if $interactionMode !== 'select'}
  <div
    class="absolute top-20 left-1/2 z-[1001] -translate-x-1/2"
    in:fly={{ y: -16, duration: 220, opacity: 0 }}
    out:fly={{ y: -16, duration: 160, opacity: 0 }}
  >
    <div class="veto-popup flex items-center gap-3 px-4 py-2.5">
      {#if $interactionMode === 'place'}
        <MapPin class="h-4 w-4 text-stone-600 dark:text-stone-400" />
        <span class="text-sm text-stone-700 dark:text-stone-300">{t('components_place_hint')}</span>
      {:else if $interactionMode === 'route'}
        <Navigation class="h-4 w-4 text-stone-600 dark:text-stone-400" />
        <span class="text-sm text-stone-700 dark:text-stone-300">
          {#if $routeInsertMode}
            {t('components_route_insert_hint')}
          {:else if $pendingRoute}
            {t('components_pending_route_hint', { mode: $pendingRoute.type, count: $pendingRoute.points.length })}
          {:else}
            {t('components_route_direct_hint')}
          {/if}
        </span>
      {:else if $interactionMode === 'strike'}
        <Target class="h-4 w-4 text-stone-600 dark:text-stone-400" />
        <span class="text-sm text-stone-700 dark:text-stone-300">
          {strikePendingTarget ? t('components_confirm_strike_radius') : t('components_select_strike_target')}
        </span>
      {:else if $interactionMode === 'measure'}
        <Ruler class="h-4 w-4 text-amber-500" />
        <span class="text-sm text-stone-700 dark:text-stone-300">{t('components_measure_hint')}</span>
      {:else if $interactionMode === 'attack'}
        <Crosshair class="h-4 w-4 text-rose-500" />
        <span class="text-sm text-stone-700 dark:text-stone-300"
          >{t('components_attack_hint')}</span
        >
      {/if}
      <div class="mx-1 h-4 w-px bg-stone-200 dark:bg-stone-700"></div>
      <Button
        variant="ghost"
        size="sm"
        class="h-7 gap-1.5 px-2 text-xs text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
        onclick={() => {
          interactionMode.set('select')
          pendingPlaceUnitId.set(null)
        }}
      >
        <X class="h-3 w-3" />
        {t('components_cancel')}
        <Kbd.Root class="ml-0.5 text-[10px]">Esc</Kbd.Root>
      </Button>
    </div>
  </div>
{/if}
