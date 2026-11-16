<script lang="ts">
  import { Clock, Pause, Play, Square } from '@lucide/svelte'
  import { t } from '$lib/i18n'
  import { Button } from '$lib/components/ui/button'
  import { formatTime } from '$lib/classes/formatters/time-formater'
  import {
    pauseStandaloneTimer,
    resetStandaloneTimer,
    standaloneTimer,
    startStandaloneTimer,
    timerDialogOpen
  } from '$lib/classes/stores/conference/timer-store'

  const timer = $derived($standaloneTimer)
  const isExpired = $derived(timer != null && !timer.isRunning && timer.remainingSec <= 0)
  const remainingPercent = $derived(
    timer ? Math.max(0, Math.min(100, (timer.remainingSec / timer.totalSec) * 100)) : 0
  )
  const statusLabel = $derived(
    isExpired
      ? t('procedure_timer_expired')
      : timer?.isRunning
        ? t('procedure_timer_running')
        : t('procedure_paused')
  )
  const statusClass = $derived(
    isExpired
      ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
      : timer?.isRunning
        ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
        : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
  )
  const statusDotClass = $derived(
    isExpired ? 'bg-red-500' : timer?.isRunning ? 'bg-indigo-500' : 'bg-amber-500'
  )

  function openDialog(): void {
    timerDialogOpen.set(true)
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    openDialog()
  }

  function handlePrimaryAction(event: MouseEvent): void {
    event.stopPropagation()
    if (!timer) return
    if (timer.isRunning) {
      pauseStandaloneTimer()
    } else {
      startStandaloneTimer(timer.totalSec)
    }
  }

  function handleStop(event: MouseEvent): void {
    event.stopPropagation()
    resetStandaloneTimer()
  }
</script>

{#if timer}
  <section
    class="group mb-4 w-full rounded-[10px] border border-border bg-card p-3 text-left shadow-sm transition-[border-color,box-shadow,transform] hover:-translate-y-px hover:border-foreground/20 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/50"
    role="button"
    tabindex="0"
    aria-label={`${t('procedure_remaining_time')} ${formatTime(timer.remainingSec)} · ${t('procedure_open_standalone_timer')}`}
    title={t('procedure_open_standalone_timer')}
    onclick={openDialog}
    onkeydown={handleKeydown}
  >
    <div class="flex items-center justify-between gap-2">
      <span class="text-[9px] font-medium tracking-wide text-muted-foreground">
        {t('procedure_remaining_time')}
      </span>
      <span
        class="flex h-5 items-center gap-1.5 rounded-full px-2 text-[9px] font-semibold {statusClass}"
      >
        <span
          class="size-1 rounded-full {statusDotClass} {timer.isRunning ? 'animate-pulse' : ''}"
        ></span>
        {statusLabel}
      </span>
    </div>

    <div class="mt-1.5 flex items-center justify-between gap-2">
      <span class="font-mono text-3xl leading-none font-bold tracking-tight tabular-nums">
        {formatTime(timer.remainingSec)}
      </span>
      <div class="flex items-center gap-1">
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          class="size-7"
          title={timer.isRunning ? t('procedure_pause_timer') : t('procedure_resume_timer')}
          aria-label={timer.isRunning ? t('procedure_pause_timer') : t('procedure_resume_timer')}
          onclick={handlePrimaryAction}
        >
          {#if timer.isRunning}
            <Pause class="size-3 fill-current" />
          {:else}
            <Play class="size-3 fill-current" />
          {/if}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          class="size-7"
          title={t('procedure_stop')}
          aria-label={t('procedure_stop')}
          onclick={handleStop}
        >
          <Square class="size-3 fill-current" />
        </Button>
      </div>
    </div>

    <div class="mt-3 h-[3px] overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <div class="h-full rounded-full bg-indigo-500 transition-[width]" style:width={`${remainingPercent}%`}></div>
    </div>

    <div class="mt-1.5 flex items-center justify-between gap-2 text-[9px] text-muted-foreground">
      <span class="flex items-center gap-1">
        <Clock class="size-2.5" />
        {t('procedure_timer_total', { time: formatTime(timer.totalSec) })}
      </span>
      <span>{t('procedure_click_to_open_timer')}</span>
    </div>
  </section>
{/if}
