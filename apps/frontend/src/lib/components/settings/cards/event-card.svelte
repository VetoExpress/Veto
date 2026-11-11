<script lang="ts">
  import { t } from '$lib/i18n'
  import { Switch } from '$lib/components/ui/switch/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import type { EventSetting } from '$lib/classes/types/battle'
  import {
    AlertTriangleIcon,
    UsersIcon,
    RadioIcon,
    SwordsIcon,
    PackageXIcon,
    FlameIcon,
    Trash2Icon
  } from '@lucide/svelte/icons'

  interface EventMeta {
    icon: typeof AlertTriangleIcon
    description: string
    colorClass: string
  }

  const EVENT_META: Record<string, EventMeta> = $derived({
    natural_disaster: {
      icon: AlertTriangleIcon,
      description: t('settings_event_natural_description'),
      colorClass: 'text-orange-400'
    },
    refugee_crisis: {
      icon: UsersIcon,
      description: t('settings_event_refugee_description'),
      colorClass: 'text-yellow-400'
    },
    electronic_warfare: {
      icon: RadioIcon,
      description: t('settings_event_electronic_description'),
      colorClass: 'text-sky-400'
    },
    local_conflict: {
      icon: SwordsIcon,
      description: t('settings_event_conflict_description'),
      colorClass: 'text-red-400'
    },
    supply_disruption: {
      icon: PackageXIcon,
      description: t('settings_event_supply_description'),
      colorClass: 'text-purple-400'
    },
    civilian_uprising: {
      icon: FlameIcon,
      description: t('settings_event_uprising_description'),
      colorClass: 'text-rose-400'
    }
  })

  let {
    event = $bindable<EventSetting>({
      id: '',
      label: '',
      enabled: false,
      probability: 50
    }),
    canDelete = false,
    ondelete
  }: {
    event: EventSetting
    canDelete?: boolean
    ondelete?: () => void
  } = $props()

  const meta = $derived(EVENT_META[event.id] as EventMeta | undefined)
</script>

<div
  class="rounded-lg border p-3.5 space-y-3 transition-all duration-200 {event.enabled
    ? 'border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-800'
    : 'border-stone-100 bg-stone-50/60 opacity-60 dark:border-stone-800 dark:bg-stone-900/60'}"
>
  <!-- 标题行 -->
  <div class="flex items-start justify-between gap-3">
    <div class="flex items-start gap-3 min-w-0">
      {#if meta}
        {@const EventIcon = meta.icon}
        <div class="mt-0.5 shrink-0">
          <EventIcon size={14} class={meta.colorClass} />
        </div>
      {/if}
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium text-stone-700 leading-none dark:text-stone-300">
          {event.label}
        </p>
        {#if meta}
          <p class="text-[11px] text-stone-400 mt-1.5 leading-snug dark:text-muted-foreground">
            {meta.description}
          </p>
        {:else}
          <p class="text-[11px] text-stone-400 mt-1 leading-snug dark:text-muted-foreground">
            {t('settings_event_custom')}
          </p>
        {/if}
      </div>
    </div>
    <div class="flex items-center gap-1.5 shrink-0 mt-0.5">
      {#if canDelete}
        <button
          type="button"
          class="rounded p-0.5 text-stone-300 hover:text-red-400 hover:bg-red-50 transition-colors dark:text-stone-600 dark:hover:text-red-400 dark:hover:bg-red-900/30"
          onclick={ondelete}
          aria-label={t('settings_event_delete')}
        >
          <Trash2Icon size={13} />
        </button>
      {/if}
      <Switch bind:checked={event.enabled} />
    </div>
  </div>

  <!-- 概率滑块（始终显示） -->
  <div class="space-y-1.5">
    <div class="flex justify-between items-center">
      <span class="text-[11px] text-muted-foreground">{t('settings_event_probability')}</span>
      <span class="text-xs font-mono font-semibold text-amber-600 tabular-nums dark:text-amber-400"
        >{event.probability}%</span
      >
    </div>
    <input
      type="range"
      min="0"
      max="100"
      step="5"
      bind:value={event.probability}
      style="--val: {event.probability}%"
      class="prob-slider w-full cursor-pointer"
    />
    <div class="flex justify-between text-[10px] text-stone-400 select-none">
      <span>{t('settings_probability_low')}</span>
      <span>{t('settings_probability_medium')}</span>
      <span>{t('settings_probability_certain')}</span>
    </div>
  </div>
</div>
