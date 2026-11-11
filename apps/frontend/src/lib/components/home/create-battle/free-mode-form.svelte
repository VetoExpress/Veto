<script lang="ts">
  import { t } from '$lib/i18n'
  import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days'
  import GaugeIcon from '@lucide/svelte/icons/gauge'
  import ShieldIcon from '@lucide/svelte/icons/shield'
  import LayersIcon from '@lucide/svelte/icons/layers'
  import PuzzleIcon from '@lucide/svelte/icons/puzzle'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Label } from '$lib/components/ui/label/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Separator } from '$lib/components/ui/separator/index.js'
  import DatePicker from '$lib/components/ui/date-picker.svelte'
  import { TIME_SCALES, TIME_SCALE_LABELS } from '$lib/classes/services/engine/game-clock.store'
  import type { DateValue } from '@internationalized/date'
  import type { InstalledPlugin } from '$lib/classes/services/plugin/plugin-db'
  import { cn } from '$lib/classes/utils.js'

  interface Props {
    draft: {
      name: string
      startDate: DateValue | undefined
      timeScale: number
      pixelsPerKm: number
      iconStyle: 'nato' | 'simple'
      selectedFaction: string | null
    }
    factionPlugins: InstalledPlugin[]
    hasAnyMods: boolean
    onenter?: () => void
  }

  let {
    draft = $bindable(),
    factionPlugins,
    hasAnyMods,
    onenter
  }: Props = $props()

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') onenter?.()
  }
</script>

<div class="flex flex-col gap-0">
  <!-- 战局代号 -->
  <section class="px-1 py-3">
    <Label for="battle-name" class="mb-2 block text-xs text-muted-foreground">{t('settings_battle_codename')}</Label>
    <Input
      id="battle-name"
      bind:value={draft.name}
      placeholder={t('settings_battle_name_placeholder')}
      class="h-9"
      onkeydown={handleKeydown}
    />
  </section>

  <Separator />

  <!-- 时间参数 -->
  <section class="px-1 py-3">
    <div class="mb-3 flex items-center gap-1.5">
      <CalendarDaysIcon size={12} class="text-muted-foreground" />
      <span class="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">{t('settings_time_parameters')}</span>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div>
        <Label class="mb-1.5 block text-xs text-muted-foreground">{t('settings_simulation_date')}</Label>
        <DatePicker bind:value={draft.startDate} class="h-9 w-full text-sm" />
      </div>
      <div>
        <Label class="mb-1.5 block text-xs text-muted-foreground">
          <GaugeIcon size={11} class="mr-1 inline text-muted-foreground" />
          {t('settings_time_scale')}
        </Label>
        <Input
          type="number"
          min="1"
          bind:value={draft.timeScale}
          class="h-9 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <div class="mt-1.5 flex flex-wrap gap-1">
          {#each TIME_SCALES as scale}
            <Button
              size="sm"
              variant={draft.timeScale === scale ? 'default' : 'outline'}
              onclick={() => (draft.timeScale = scale)}
            >
              {TIME_SCALE_LABELS[scale]}
            </Button>
          {/each}
        </div>
      </div>
    </div>
  </section>

  <Separator />

  <!-- 地图比例尺 -->
  <section class="px-1 py-3">
    <Label for="pixels-per-km" class="mb-1.5 block text-xs text-muted-foreground">
      {t('settings_map_scale')}
    </Label>
    <Input
      id="pixels-per-km"
      type="number"
      min="1"
      max="500"
      step="1"
      bind:value={draft.pixelsPerKm}
      class="h-9 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
  </section>

  <Separator />

  <!-- 视觉标准 -->
  <section class="px-1 py-3">
    <div class="mb-3 flex items-center gap-1.5">
      <ShieldIcon size={12} class="text-muted-foreground" />
      <span class="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">{t('settings_visual_standard')}</span>
    </div>
    <div class="flex gap-2">
      <Button
        variant="outline"
        class={cn(
          'flex-1',
          draft.iconStyle === 'nato'
            ? 'border-sky-500 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-400'
            : ''
        )}
        onclick={() => (draft.iconStyle = 'nato')}
      >
        <ShieldIcon size={13} />
        {t('settings_nato')}
      </Button>
      <Button
        variant="outline"
        class={cn(
          'flex-1',
          draft.iconStyle === 'simple'
            ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
            : ''
        )}
        onclick={() => (draft.iconStyle = 'simple')}
      >
        <LayersIcon size={13} />
        {t('settings_simple_icons')}
      </Button>
    </div>
  </section>

  {#if hasAnyMods}
    <Separator />

    <!-- Mod 配置 -->
    <section class="px-1 py-3">
      <div class="mb-3 flex items-center gap-1.5">
        <PuzzleIcon size={12} class="text-muted-foreground" />
        <span class="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">{t('settings_mod_configuration')}</span>
      </div>

      {#if factionPlugins.length > 0}
        <div class="mb-2">
          <Label class="mb-1.5 block text-xs text-muted-foreground">{t('settings_type_faction')}</Label>
          <div class="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant={!draft.selectedFaction ? 'default' : 'outline'}
              onclick={() => (draft.selectedFaction = null)}
            >
              {t('settings_base')}
            </Button>
            {#each factionPlugins as p (p.id)}
              <Button
                size="sm"
                variant={draft.selectedFaction === p.id ? 'default' : 'outline'}
                onclick={() => (draft.selectedFaction = p.id)}
              >
                {p.manifest.name}
              </Button>
            {/each}
          </div>
        </div>
      {/if}

    </section>
  {/if}
</div>
