<script lang="ts">
  import { t, getLocale } from '$lib/i18n'
  import { goto } from '$app/navigation'
  import { Trash2, Play, Pencil, Check, X, Clock, Copy } from '@lucide/svelte'
  import type { Timeline } from '$lib/classes/stores/timeline-store'
  import { currentTimelineId, deleteTimeline, renameTimeline } from '$lib/classes/stores/timeline-store'
  import * as AlertDialog from '$lib/components/ui/alert-dialog'
  import { Card, CardHeader, CardTitle, CardAction, CardContent } from '$lib/components/ui/card'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'

  let { timeline }: { timeline: Timeline } = $props()

  let editing = $state(false)
  let editName = $state('')
  let inputRef = $state<HTMLInputElement | null>(null)
  let deleteTarget = $state<{ id: string; name: string } | null>(null)

  const isActive = $derived($currentTimelineId === timeline.id)

  function handleEnter(): void {
    if (editing) return
    currentTimelineId.set(timeline.id)
    goto(`/tools/${timeline.id}`)
  }

  function handleDelete(e: MouseEvent): void {
    e.stopPropagation()
    deleteTarget = { id: timeline.id, name: timeline.name }
  }

  function startEdit(e: MouseEvent): void {
    e.stopPropagation()
    editName = timeline.name
    editing = true
    setTimeout(() => inputRef?.focus(), 0)
  }

  function commitEdit(): void {
    if (editName.trim()) renameTimeline(timeline.id, editName)
    editing = false
  }

  function cancelEdit(): void {
    editName = timeline.name
    editing = false
  }

  function handleInputKeydown(e: KeyboardEvent): void {
    e.stopPropagation()
    if (e.key === 'Enter') commitEdit()
    else if (e.key === 'Escape') cancelEdit()
  }

  function formatSimTime(ts: number): string {
    return new Intl.DateTimeFormat(getLocale(), { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(ts)
  }

  let copied = $state(false)

  async function copySimTime(e: MouseEvent): Promise<void> {
    e.stopPropagation()
    const text = formatSimTime(liveSimTime)
    await navigator.clipboard.writeText(text)
    copied = true
    setTimeout(() => (copied = false), 1500)
  }

  const ratioLabel = $derived(
    timeline.state.ratio >= 86400
      ? t('components_day_per_second')
      : timeline.state.ratio >= 3600
        ? t('components_hour_per_second')
        : timeline.state.ratio >= 60
          ? t('components_minute_per_second')
          : `${timeline.state.ratio}x`
  )

  // ── 实时模拟时间（运行中通过 RAF 循环更新） ──────────────────────────
  const paused = $derived(timeline.state.paused)
  const simAnchor = $derived(timeline.state.simulationAnchor)
  const realAnchor = $derived(timeline.state.realAnchor)
  const ratio = $derived(timeline.state.ratio)
  const pausedSimTime = $derived(timeline.state.pausedSimulationTime)

  let liveSimTime = $state(
    paused ? (pausedSimTime ?? simAnchor) : simAnchor + (Date.now() - realAnchor) * ratio
  )

  $effect(() => {
    if (paused) {
      liveSimTime = pausedSimTime ?? simAnchor
      return () => {}
    }

    let rafId: number
    const loop = () => {
      liveSimTime = simAnchor + (Date.now() - realAnchor) * ratio
      rafId = requestAnimationFrame(loop)
    }
    rafId = requestAnimationFrame(loop)

    return () => cancelAnimationFrame(rafId)
  })
</script>

<Card
  class="group w-full gap-2 py-4 backdrop-blur-sm transition-all hover:shadow-md {isActive
    ? 'border-indigo-400 bg-card/90 dark:border-indigo-500'
    : 'bg-card/70 hover:bg-card/90'}"
  onclick={handleEnter}
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
          title={t('components_save')}
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
          title={t('components_cancel')}
          onclick={(e: MouseEvent) => {
            e.stopPropagation()
            cancelEdit()
          }}
        >
          <X />
        </Button>
      {:else}
        <Clock size={16} class="shrink-0 text-muted-foreground" />
        <span class="truncate font-semibold">{timeline.name}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          class="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          title={t('components_rename')}
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
        class="gap-1 border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800 dark:border-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50"
        onclick={(e: MouseEvent) => {
          e.stopPropagation()
          handleEnter()
        }}
      >
        <Play class="size-3" />
        {t('components_enter')}
      </Button>
      <Button variant="destructive" size="icon-sm" title={t('components_delete_timeline')} onclick={handleDelete}>
        <Trash2 />
      </Button>
    </CardAction>
  </CardHeader>

  <CardContent class="px-5">
    <div class="flex flex-col gap-1">
      <div class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span class="flex items-center gap-1">
          <Clock class="size-3" />
          {t('components_start_time', { time: formatSimTime(timeline.state.simulationAnchor) })}
        </span>
        <span class="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
          {ratioLabel}
        </span>
        <span class="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
          {paused ? t('components_paused') : t('components_running')}
        </span>
      </div>
      {#if !paused}
        <div class="flex items-center gap-1.5">
          <span class="text-xs font-medium text-indigo-600 dark:text-indigo-400">
            {t('components_current_time', { time: formatSimTime(liveSimTime) })}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            class="size-5 text-muted-foreground hover:text-foreground"
            title={t('components_copy_sim_time')}
            onclick={copySimTime}
          >
            {#if copied}
              <Check size={11} class="text-green-500" />
            {:else}
              <Copy size={11} />
            {/if}
          </Button>
        </div>
      {/if}
    </div>
  </CardContent>
</Card>

<AlertDialog.Root open={deleteTarget !== null} onOpenChange={(open) => { if (!open) deleteTarget = null }}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>{t('components_confirm_delete')}</AlertDialog.Title>
      <AlertDialog.Description>
        {t('components_delete_timeline_confirmation', { name: deleteTarget?.name ?? '' })}
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel onclick={() => { deleteTarget = null }}>{t('components_cancel')}</AlertDialog.Cancel>
      <AlertDialog.Action onclick={() => {
        if (deleteTarget) deleteTimeline(deleteTarget.id)
        deleteTarget = null
      }}>{t('components_delete')}</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
