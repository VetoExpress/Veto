<script lang="ts">
  import { t } from '$lib/i18n'
  /**
   * caucus-countdown-view.svelte
   * ────────────────────────
   * 自由磋商 / 辩论 / 个人演讲面板 —— 总倒计时 + 暂停/恢复/结束控制。
   */
  import { onDestroy } from 'svelte'
  import { get } from 'svelte/store'
  import { Timer, Coffee, MessageSquare, Mic } from '@lucide/svelte'
  import PanelHeader from '$lib/components/conference/common/panel-header.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Separator } from '$lib/components/ui/separator/index.js'
  import {
    currentCommittee,
    saveConferencesNow,
    endCaucus,
    pauseCaucus,
    resumeCaucus
  } from '$lib/classes/stores/conference/conference-store'
  import { destroyTimer } from '$lib/classes/services/engine/conference-engine'
  import { formatTime } from '$lib/classes/formatters/time-formater'
  import {
    getDisplayBridge,
    buildDisplayData
  } from '$lib/classes/clients/conference-display-client'
  import { useCaucusCountdown } from '$lib/classes/services/hooks/use-caucus-countdown.svelte'
  import type { Committee } from '$lib/classes/domain/committee.svelte'

  let {
    mode
  }: {
    mode: 'unmoderated' | 'moderated_debate' | 'unmoderated_debate' | 'individual'
  } = $props()

  const conf = $derived($currentCommittee)
  const title = $derived(
    mode === 'individual'
      ? t('procedure_individual_speech')
      : mode === 'moderated_debate'
        ? t('procedure_moderated_debate')
        : mode === 'unmoderated_debate'
          ? t('procedure_unmoderated_debate')
          : t('procedure_unmoderated_caucus')
  )
  const HeaderIcon = $derived(
    mode === 'individual'
      ? Mic
      : mode === 'moderated_debate' || mode === 'unmoderated_debate'
        ? MessageSquare
        : Coffee
  )
  const topic = $derived.by(() => {
    if (mode !== 'moderated_debate' || !conf?.activeCaucus) return undefined
    const motion = conf.motions.find((item) => item.id === conf.activeCaucus?.motionId)
    return motion?.type === 'moderated_debate' ? motion.topic : undefined
  })

  function getEngine(): Committee | null | undefined {
    return get(currentCommittee)
  }

  function syncDisplay(): void {
    const engine = getEngine()
    if (engine) getDisplayBridge().sendUpdate(buildDisplayData(engine))
  }

  const caucusCountdown = useCaucusCountdown({
    get enabled() {
      return true
    },
    timerId: 'caucus-countdown',
    getEngine,
    onExpire() {
      endCaucus()
      syncDisplay()
    },
    onTick(data) {
      getDisplayBridge().sendTimerTick({
        remainingSec: data.remainingSec,
        elapsedSec: data.elapsedSec,
        totalSec: caucusCountdown.totalSec,
        status: caucusCountdown.isCaucusPaused ? 'paused' : 'playing'
      })
    }
  })

  const progressPercent = $derived(
    caucusCountdown.totalSec > 0
      ? ((caucusCountdown.totalSec - caucusCountdown.totalRemainingSec) /
          caucusCountdown.totalSec) *
          100
      : 0
  )

  function pauseCaucusHandler(): void {
    caucusCountdown.isCaucusPaused = true
    pauseCaucus()
    syncDisplay()
  }

  function resumeCaucusHandler(): void {
    caucusCountdown.isCaucusPaused = false
    resumeCaucus()
    syncDisplay()
  }

  onDestroy(() => {
    saveConferencesNow()
    destroyTimer('caucus-countdown')
  })
</script>

<div class="flex w-full flex-col gap-4">
  {#if conf}
    <div class="flex flex-col items-center gap-6">
      <PanelHeader icon={HeaderIcon} {title} />

      {#if topic}
        <p class="max-w-2xl text-center text-lg font-medium text-foreground">{topic}</p>
      {/if}

      <div class="text-center">
        {#if caucusCountdown.isCaucusPaused}
          <div class="mb-2 text-sm font-medium text-amber-500 uppercase tracking-wider">
            {t('procedure_timer_paused')}
          </div>
        {/if}
        <div
          class="font-mono text-7xl font-bold tabular-nums transition-colors"
          class:text-amber-500={caucusCountdown.isCaucusPaused}
          class:text-red-500={!caucusCountdown.isCaucusPaused &&
            caucusCountdown.totalRemainingSec <= 30}
          class:text-foreground={!caucusCountdown.isCaucusPaused &&
            caucusCountdown.totalRemainingSec > 30}
        >
          {formatTime(caucusCountdown.totalRemainingSec)}
        </div>
        <div class="mt-2 text-sm text-muted-foreground">
          {t('procedure_caucus_elapsed', { value1: formatTime(caucusCountdown.totalElapsedSec) })}
        </div>
      </div>

      <div class="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          class="h-full rounded-full transition-all duration-1000 {caucusCountdown.isCaucusPaused
            ? 'bg-amber-500'
            : caucusCountdown.totalRemainingSec <= 30
              ? 'bg-red-500'
              : 'bg-indigo-500'}"
          style="width: {progressPercent}%"
        ></div>
      </div>

      <Separator />

      <div class="flex gap-4">
        {#if caucusCountdown.isCaucusPaused}
          <Button variant="default" onclick={resumeCaucusHandler} class="min-w-[140px] gap-2">
            <Timer size={14} />
            {t('procedure_resume_timer')}
          </Button>
        {:else}
          <Button variant="outline" onclick={pauseCaucusHandler} class="min-w-[140px] gap-2">
            {t('procedure_pause_timer')}
          </Button>
        {/if}
        <Button variant="destructive" onclick={endCaucus} class="min-w-[140px] gap-2">
          <Timer size={14} />
          {t('procedure_finish_early')}{title}
        </Button>
      </div>
    </div>
  {:else}
    <div class="flex flex-col items-center gap-4 text-muted-foreground">
      <Timer size={48} class="opacity-30" />
      <p class="text-lg font-medium">{t('procedure_no_meeting_in_progress')}</p>
    </div>
  {/if}
</div>
