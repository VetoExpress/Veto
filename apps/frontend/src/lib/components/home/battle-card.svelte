<script lang="ts">
  import { t, formatDate } from '$lib/i18n'
  import { goto } from '$app/navigation'
  import { Trash2, Play, Pencil, Check, X, CalendarDays, Clock, Swords } from '@lucide/svelte'
  import type { Battle } from '$lib/classes/types/battle'
  import {
    currentBattleId,
    loadBattle,
    deleteBattle,
    renameBattle
  } from '$lib/classes/stores/battle/battle-store'
  import { showConfirm } from '$lib/classes/stores/app/global-ui-store'
  import { registry } from '$lib/classes/services/plugin/mod-registry.svelte'
  import { Card, CardHeader, CardTitle, CardAction, CardContent } from '$lib/components/ui/card'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'

  let { battle }: { battle: Battle } = $props()

  let editing = $state(false)
  let editName = $state('')
  let inputRef = $state<HTMLInputElement | null>(null)

  const isActive = $derived($currentBattleId === battle.id)

  /** 战役包名称（仅当此战局关联了战役时） */
  const campaignName = $derived.by(() => {
    if (!battle.campaignId) return null
    const mod = registry.getMod(battle.campaignId)
    return mod?.metadata?.name ?? mod?.id ?? null
  })

  function handleLoad(): void {
    if (editing || !battle.conferenceId) return
    loadBattle(battle.id)
    goto(`/client/${battle.conferenceId}/battle`)
  }

  function handleDelete(e: MouseEvent): void {
    e.stopPropagation()
    showConfirm(t('settings_confirm_delete'), t('settings_delete_battle_named', { name: battle.name }), () =>
      deleteBattle(battle.id)
    )
  }

  function startEdit(e: MouseEvent): void {
    e.stopPropagation()
    editName = battle.name
    editing = true
    setTimeout(() => inputRef?.focus(), 0)
  }

  function commitEdit(): void {
    if (editName.trim()) renameBattle(battle.id, editName)
    editing = false
  }

  function cancelEdit(): void {
    editName = battle.name
    editing = false
  }

  function handleInputKeydown(e: KeyboardEvent): void {
    e.stopPropagation()
    if (e.key === 'Enter') commitEdit()
    else if (e.key === 'Escape') cancelEdit()
  }

</script>

<!-- Click handled by CardAction button, not the card itself -->
<Card
  class="group w-full gap-2 py-4 backdrop-blur-sm transition-all hover:shadow-md {isActive
    ? 'border-stone-400 bg-card/90 dark:border-stone-500'
    : 'bg-card/70 hover:bg-card/90'}"
>
  <CardHeader class="px-5">
    <CardTitle class="flex min-w-0 items-center gap-1.5 text-sm">
      {#if editing}
        <Input
          bind:ref={inputRef}
          bind:value={editName}
          class="h-7 min-w-0 flex-1 text-sm font-semibold"
          onclick={(e: MouseEvent) => e.stopPropagation()}
          onkeydown={handleInputKeydown}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          class="shrink-0 text-green-600 hover:bg-green-50 hover:text-green-700 dark:text-green-400 dark:hover:bg-green-900/30 dark:hover:text-green-300"
          title={t('settings_save')}
          onclick={(e: MouseEvent) => {
            e.stopPropagation()
            commitEdit()
          }}
        >
          <Check />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          class="shrink-0"
          title={t('settings_cancel')}
          onclick={(e: MouseEvent) => {
            e.stopPropagation()
            cancelEdit()
          }}
        >
          <X />
        </Button>
      {:else}
        <span class="truncate font-semibold">{battle.name}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          class="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          title={t('settings_rename')}
          onclick={startEdit}
        >
          <Pencil />
        </Button>
      {/if}
    </CardTitle>

    <CardAction class="flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
      <Button
        variant="outline"
        size="sm"
        class="gap-1 border-green-200 bg-green-50 text-green-700 hover:bg-green-100 hover:text-green-800 dark:border-green-800 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50"
        onclick={(e: MouseEvent) => {
          e.stopPropagation()
          handleLoad()
        }}
      >
        <Play class="size-3" />
        {t('settings_enter')}
      </Button>
      <Button variant="destructive" size="icon-sm" title={t('settings_delete_battle')} onclick={handleDelete}>
        <Trash2 />
      </Button>
    </CardAction>
  </CardHeader>

  <CardContent class="px-5">
    {#if campaignName}
      <div class="mb-1.5">
        <span class="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
          <Swords class="size-3" />
          {t('settings_campaign_prefix', { name: campaignName })}
        </span>
      </div>
    {/if}
    <div class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span class="flex items-center gap-1">
        <CalendarDays class="size-3" />
        {formatDate(battle.createdAt, { dateStyle: 'short', timeStyle: 'short' })}
      </span>
      <span class="flex items-center gap-1">
        <Clock class="size-3" />
        {battle.startDate ?? t('settings_simulation_time_unset')}
      </span>
      <!-- <span class="flex items-center gap-1">
        <Zap class="size-3" />
        {enabledEvents} 个启用事件
      </span> -->
    </div>
  </CardContent>
</Card>
