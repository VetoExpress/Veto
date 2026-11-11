<!-- Hallmark · component scope · inherited workbench theme · pre-emit critique: P4 H4 E4 S4 R5 V4 -->
<script lang="ts">
  import { t, getLocale } from '$lib/i18n'
  import { onMount } from 'svelte'
  import { Clock3, Timer, Plus, Check, Copy, X } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button'
  import * as Popover from '$lib/components/ui/popover'
  import * as Command from '$lib/components/ui/command'
  import { standaloneTimer, timerDialogOpen } from '$lib/classes/stores/conference/timer-store'
  import { formatTime } from '$lib/classes/formatters/time-formater'
  import { timelines } from '$lib/classes/stores/timeline-store'
  import {
    currentConferenceRecord,
    bindTimeline
  } from '$lib/classes/stores/conference/conference-store'
  import type { CloudTimeline } from '$lib/classes/clients/cloud-situation-client'

  let {
    cloudMode = false,
    cloudTimeline = null,
    cloudTimezone = 'Asia/Shanghai',
    cloudTimelineReceivedAt = 0,
    expanded = false
  }: {
    cloudMode?: boolean
    cloudTimeline?: CloudTimeline | null
    cloudTimezone?: string
    cloudTimelineReceivedAt?: number
    expanded?: boolean
  } = $props()

  let clockNow = $state(Date.now())
  onMount(() => {
    const interval = window.setInterval(() => (clockNow = Date.now()), 1000)
    return () => window.clearInterval(interval)
  })
  const cloudTime = $derived(
    cloudTimeline
      ? cloudTimeline.currentTime +
          (cloudTimeline.paused ? 0 : (clockNow - cloudTimelineReceivedAt) * cloudTimeline.ratio)
      : null
  )

  function formatCloudTime(ts: number, short = false): string {
    return new Intl.DateTimeFormat(getLocale(), {
      timeZone: cloudTimezone,
      ...(!short ? { year: 'numeric' as const } : {}),
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(ts)
  }

  // ─── 时间线数据 ──────────────────────────────────────────────────────

  const conf = $derived($currentConferenceRecord)
  const timelineId = $derived(conf?.timelineId ?? null)
  const timeline = $derived(timelineId ? $timelines.find((t) => t.id === timelineId) : null)
  const timelineItems = $derived($timelines.map((t) => ({ value: t.id, label: t.name })))

  const tlState = $derived(timeline?.state)
  const tlPaused = $derived(tlState?.paused ?? true)
  const tlSimAnchor = $derived(tlState?.simulationAnchor ?? 0)
  const tlRealAnchor = $derived(tlState?.realAnchor ?? 0)
  const tlRatio = $derived(tlState?.ratio ?? 1)
  const tlPausedSimTime = $derived(tlState?.pausedSimulationTime)

  let liveSimTime = $state(0)

  $effect(() => {
    if (cloudMode || tlPaused || !timeline) {
      liveSimTime = tlPausedSimTime ?? tlSimAnchor
      return () => {}
    }

    let rafId: number
    const loop = () => {
      liveSimTime = tlSimAnchor + (Date.now() - tlRealAnchor) * tlRatio
      rafId = requestAnimationFrame(loop)
    }
    rafId = requestAnimationFrame(loop)

    return () => cancelAnimationFrame(rafId)
  })

  function formatSimTime(ts: number): string {
    return new Intl.DateTimeFormat(getLocale(), {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(ts)
  }

  let copied = $state(false)

  async function copySimTime(): Promise<void> {
    await navigator.clipboard.writeText(
      cloudMode && cloudTime !== null ? formatCloudTime(cloudTime) : formatSimTime(liveSimTime)
    )
    copied = true
    setTimeout(() => (copied = false), 1500)
  }

  let timelinePopoverOpen = $state(false)

  function handleBind(value: string): void {
    if (conf) {
      bindTimeline(conf.id, value)
    }
    timelinePopoverOpen = false
  }

  function handleUnbind(): void {
    if (conf) {
      bindTimeline(conf.id, null)
    }
  }

  // ─── 可见性 ──────────────────────────────────────────────────────────

  const visible = $derived(
    cloudMode || $standaloneTimer != null || timeline != null || timelineItems.length > 0
  )
</script>

{#if visible}
  <div class="flex min-w-0 justify-center">
    <div
      class={expanded
        ? 'flex min-w-0 flex-wrap items-center gap-3 text-sm text-foreground'
        : 'flex h-7 min-w-0 items-center gap-2 px-1 text-xs text-foreground'}
    >
      {#if cloudMode}
        {#if cloudTimeline && cloudTime !== null}
          <Clock3 class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span
            class={expanded
              ? 'text-muted-foreground'
              : 'hidden max-w-24 truncate text-muted-foreground lg:inline'}
            title={cloudTimeline.name}
          >
            {cloudTimeline.name}
          </span>
          <span
            class={`whitespace-nowrap font-mono font-medium tabular-nums ${expanded ? 'text-lg' : ''}`}
            title={`${cloudTimeline.name} · ${cloudTimeline.paused ? t('components_paused') : t('components_ratio_running', { ratio: cloudTimeline.ratio })}`}
          >
            {#if expanded}
              {formatCloudTime(cloudTime)}
            {:else}
              <span class="sm:hidden">{formatCloudTime(cloudTime, true)}</span>
              <span class="hidden sm:inline">{formatCloudTime(cloudTime)}</span>
            {/if}
          </span>
          <span
            class={expanded
              ? 'whitespace-nowrap text-muted-foreground'
              : 'hidden whitespace-nowrap text-muted-foreground lg:inline'}
          >
            {cloudTimeline.paused ? t('components_pause') : `${cloudTimeline.ratio}x`}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            class="size-5 text-muted-foreground hover:bg-accent hover:text-foreground"
            title={t('components_copy_sim_time')}
            aria-label={t('components_copy_sim_time')}
            onclick={copySimTime}
          >
            {#if copied}<Check size={11} />{:else}<Copy size={11} />{/if}
          </Button>
        {:else}
          <Clock3 class="size-3.5 text-muted-foreground" aria-hidden="true" />
          <span class="whitespace-nowrap text-muted-foreground">{t('components_no_timeline')}</span>
        {/if}
      {:else}
        {#if $standaloneTimer}
          {@const st = $standaloneTimer}
          {@const expired = !st.isRunning && st.remainingSec <= 0}
          <Button
            variant="ghost"
            size="xs"
            class="h-auto gap-1 px-1.5 py-0 font-mono tabular-nums hover:bg-accent {expired
              ? 'text-destructive'
              : st.isRunning
                ? 'text-foreground'
                : 'text-muted-foreground'}"
            onclick={() => timerDialogOpen.set(true)}
            title={expired
              ? t('components_timer_expired_open')
              : st.isRunning
                ? t('components_timer_running_open')
                : t('components_timer_paused_open')}
          >
            <Timer size={12} class={expired ? 'animate-pulse' : ''} />
            <span>{formatTime(st.remainingSec)}</span>
          </Button>
          {#if timeline || timelineItems.length > 0}
            <span class="h-4 w-px bg-border"></span>
          {/if}
        {/if}

        {#if timeline}
          <div class="flex items-center gap-1.5">
            <span class="font-mono tabular-nums">{formatSimTime(liveSimTime)}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              class="size-5 text-muted-foreground hover:bg-accent hover:text-foreground"
              title={t('components_copy_sim_time')}
              onclick={copySimTime}
            >
              {#if copied}
                <Check size={11} />
              {:else}
                <Copy size={11} />
              {/if}
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              class="size-5 text-muted-foreground hover:bg-accent hover:text-destructive"
              title={t('components_unbind')}
              onclick={handleUnbind}
            >
              <X size={11} />
            </Button>
          </div>
        {:else if timelineItems.length > 0}
          <Popover.Root bind:open={timelinePopoverOpen}>
            <Popover.Trigger>
              {#snippet child({ props })}
                <Button
                  variant="ghost"
                  size="xs"
                  class="h-auto gap-1 px-1.5 py-0 text-muted-foreground hover:bg-accent hover:text-foreground"
                  {...props}
                >
                  <Plus size={11} />
                  <span>{t('components_bind_timeline')}</span>
                </Button>
              {/snippet}
            </Popover.Trigger>
            <Popover.Content class="w-[200px] p-0">
              <Command.Root>
                <Command.Input placeholder={t('components_search')} />
                <Command.List>
                  <Command.Empty>{t('components_no_matches')}</Command.Empty>
                  <Command.Group>
                    {#each timelineItems as item (item.value)}
                      <Command.Item value={item.value} onSelect={() => handleBind(item.value)}>
                        {item.label}
                      </Command.Item>
                    {/each}
                  </Command.Group>
                </Command.List>
              </Command.Root>
            </Popover.Content>
          </Popover.Root>
        {/if}
      {/if}
    </div>
  </div>
{/if}
