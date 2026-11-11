<script lang="ts">
  import { t } from '$lib/i18n'
  /**
   * moderated-caucus-view.svelte
   * ─────────────────────────────
   * 有主持核心磋商面板 —— 逐人计时 + 总时间预算 + 发言队列管理。
   */
  import { onDestroy, onMount } from 'svelte'
  import { get } from 'svelte/store'
  import { Timer, MessageSquare } from '@lucide/svelte'
  import PanelHeader from '$lib/components/conference/common/panel-header.svelte'
  import { Separator } from '$lib/components/ui/separator/index.js'
  import ActiveSpeakerCard from '$lib/components/conference/speakers/active-speaker-card.svelte'
  import ReadySpeakerCard from '$lib/components/conference/speakers/ready-speaker-card.svelte'
  import WaitingSpeakerList from '$lib/components/conference/speakers/waiting-speaker-list.svelte'

  import {
    currentCommittee,
    saveConferencesNow,
    pauseSpeaker,
    resumeSpeaker,
    advanceCaucusSpeaker,
    cancelCaucusSpeaker,
    startCaucusSpeaker
  } from '$lib/classes/stores/conference/conference-store'
  import { destroyTimer } from '$lib/classes/services/engine/conference-engine'
  import { formatTime } from '$lib/classes/formatters/time-formater'
  import {
    getDisplayBridge,
    buildDisplayData
  } from '$lib/classes/clients/conference-display-client'
  import {
    SpeakerTimerState,
    usePerSpeakerTimer
  } from '$lib/classes/services/hooks/use-speaker-timer.svelte'
  import { usePausedStateRestore } from '$lib/classes/services/hooks/use-paused-state-restore.svelte'
  import type { Committee } from '$lib/classes/domain/committee.svelte'
  import type { SpeakerDisplayEntry } from '$lib/classes/types/conference'

  // ── 发言队列数据 ──────────────────────────────────────────────
  const conf = $derived($currentCommittee)
  const activeCaucus = $derived(conf?.activeCaucus ?? null)

  const speakers = $derived<SpeakerDisplayEntry[]>(
    (activeCaucus?.caucusSpeakers ?? []).map((s) => ({
      id: s.id,
      seatId: s.seatId,
      seatName: conf?.seats.find((d) => d.id === s.seatId)?.name ?? '',
      status: s.status,
      allocatedTimeSec: s.allocatedTimeSec
    }))
  )

  const readyEntry = $derived(speakers.find((s) => s.status === 'ready') ?? null)
  const waitingSpeakers = $derived(speakers.filter((s) => s.status === 'waiting'))
  const currentIdx = $derived(activeCaucus?.currentSpeakerIndex ?? -1)

  const activeSpeaker = $derived.by(() => {
    const eng = conf?.activeSpeaker
    if (!eng) return null
    const entry = speakers.find((s) => s.id === eng.entryId || s.seatId === eng.entryId)
    if (!entry) return null
    return { ...entry, status: 'speaking' as const }
  })

  const isSpeakerActive = $derived(activeSpeaker !== null)

  // ── 计时器 ────────────────────────────────────────────────────
  const timerState = new SpeakerTimerState()

  function getEngine(): Committee | null | undefined {
    return get(currentCommittee)
  }

  function syncDisplay(): void {
    const engine = getEngine()
    if (engine) getDisplayBridge().sendUpdate(buildDisplayData(engine))
  }

  function sendTick(data: { remainingSec: number; elapsedSec: number }): void {
    getDisplayBridge().sendTimerTick({
      remainingSec: data.remainingSec,
      elapsedSec: data.elapsedSec,
      totalSec: timerState.displayTotal,
      status: timerState.isPaused ? 'paused' : 'playing'
    })
  }

  // ── 音频提示 ──────────────────────────────────────────────────
  let audioCtx: AudioContext | null = null

  function ensureAudioCtx(): AudioContext {
    if (!audioCtx) audioCtx = new AudioContext()
    return audioCtx
  }

  function playBeep(): void {
    try {
      const ctx = ensureAudioCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880
      osc.type = 'sine'
      gain.gain.value = 0.1
      osc.start()
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)
      osc.stop(ctx.currentTime + 0.15)
    } catch {
      // AudioContext 可能在非用户交互上下文中被阻止
    }
  }

  let lastBeepRemaining = $state(-1)

  function maybeBeep(remainingSec: number): void {
    const remaining = Math.round(remainingSec)
    if (remaining <= 0 || remaining === lastBeepRemaining) return
    if (remaining === 30 || remaining === 10 || remaining === 5) {
      lastBeepRemaining = remaining
      playBeep()
    }
  }

  function sendTickWithAudio(data: { remainingSec: number; elapsedSec: number }): void {
    sendTick(data)
    maybeBeep(data.remainingSec)
  }

  usePerSpeakerTimer(timerState, {
    get enabled() {
      return true
    },
    timerId: 'caucus-speaker',
    tickMs: 1000,
    getEngine,
    onExpire() {
      advanceCaucusSpeaker()
      syncDisplay()
    },
    onTick: sendTickWithAudio
  })

  usePausedStateRestore(timerState, {
    get enabled() {
      return true
    },
    getEngine,
    isExcludedCaucus: false
  })

  // ── 挂载时同步 Display ───────────────────────────────────────
  $effect(() => {
    void conf
    syncDisplay()
  })

  // ── 总时间预算 ──────────────────────────────────────────────
  const totalBudgetRemaining = $derived(
    activeCaucus
      ? Math.max(
          0,
          activeCaucus.totalSec - ((activeCaucus.elapsedSec ?? 0) + timerState.displayElapsed)
        )
      : 0
  )
  const totalBudgetSec = $derived(activeCaucus ? activeCaucus.totalSec : 0)

  const isListExhausted = $derived(currentIdx >= speakers.length && speakers.length > 0)

  // ── 操作处理 ─────────────────────────────────────────────────
  function pauseSpeaking(): void {
    getDisplayBridge().sendTimerTick({
      remainingSec: timerState.displayRemaining,
      elapsedSec: timerState.displayElapsed,
      totalSec: timerState.displayTotal,
      status: 'paused'
    })
    timerState.isPaused = true
    pauseSpeaker()
    syncDisplay()
  }

  function resumeSpeaking(): void {
    timerState.isPaused = false
    resumeSpeaker()
    syncDisplay()
  }

  function finishSpeaker(): void {
    timerState.isPaused = false
    advanceCaucusSpeaker()
    syncDisplay()
  }

  function cancelReadySpeakerHandler(): void {
    cancelCaucusSpeaker()
    syncDisplay()
  }

  function startCaucusSpeakerHandler(): void {
    startCaucusSpeaker()
    syncDisplay()
  }

  // ── 键盘快捷键（无让渡）─────────────────────────────────────
  function isInInput(el: HTMLElement): boolean {
    const tag = el.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
  }

  function handleSpeakerKeydown(e: KeyboardEvent): void {
    if (isInInput(e.target as HTMLElement)) return

    if (e.key === ' ' && !e.ctrlKey && !e.altKey) {
      if (!isSpeakerActive) return
      e.preventDefault()
      if (timerState.isPaused) {
        resumeSpeaking()
      } else {
        pauseSpeaking()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      if (isSpeakerActive) {
        finishSpeaker()
      } else {
        cancelCaucusSpeaker()
        syncDisplay()
      }
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleSpeakerKeydown)
    return () => window.removeEventListener('keydown', handleSpeakerKeydown)
  })

  // ── Cleanup ──────────────────────────────────────────────────
  onDestroy(() => {
    saveConferencesNow()
    destroyTimer('caucus-speaker')
  })
</script>

<div class="flex w-full flex-col gap-4">
  {#if conf}
    <div class="flex items-center gap-3 text-sm text-muted-foreground">
      <span>{t('procedure_total_remaining')}</span>
      <span class="font-mono font-semibold text-foreground">
        {formatTime(totalBudgetRemaining)}
      </span>
      <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          class="h-full rounded-full transition-all duration-1000 {totalBudgetRemaining <= 30
            ? 'bg-red-500'
            : 'bg-indigo-500'}"
          style="width: {totalBudgetSec > 0
            ? ((totalBudgetSec - totalBudgetRemaining) / totalBudgetSec) * 100
            : 0}%"
        ></div>
      </div>
    </div>

    {@const perTime = activeSpeaker?.allocatedTimeSec ?? 60}
    {@const maxCapacity = Math.floor(totalBudgetRemaining / perTime)}
    <div class="text-center text-xs {maxCapacity === 0 ? 'text-red-400' : 'text-muted-foreground'}">
      {t('procedure_caucus_remaining_capacity', { speakers: maxCapacity, remaining: formatTime(totalBudgetRemaining), seconds: perTime })}{#if maxCapacity === 0}<span
          class="ml-1 text-red-400"
        >
          {t('procedure_the_caucus_ends_automatically_after_the_current_speaker')}
        </span>{/if}
    </div>

    <Separator />

    <!-- ═══ 发言人区域 ═══ -->
    {#if !activeSpeaker && readyEntry}
      <ReadySpeakerCard
        seatName={readyEntry.seatName}
        allocatedTimeSec={readyEntry.allocatedTimeSec}
        onstart={startCaucusSpeakerHandler}
        oncancel={cancelReadySpeakerHandler}
      />
    {:else if isSpeakerActive && conf.activeSpeaker}
      <ActiveSpeakerCard
        seatName={activeSpeaker!.seatName}
        remainingSec={timerState.displayRemaining}
        totalSec={timerState.displayTotal}
        isPaused={timerState.isPaused}
        canYield={false}
        onpause={pauseSpeaking}
        onresume={resumeSpeaking}
        onend={() => finishSpeaker()}
      />
    {:else}
      <div class="flex flex-col items-center gap-4 text-muted-foreground">
        <Timer size={48} class="opacity-30" />
        <p class="text-lg font-medium">{t('procedure_waiting_for_a_speaker')}</p>
      </div>
    {/if}

    <WaitingSpeakerList
      title={t('procedure_speakers_queue')}
      speakers={waitingSpeakers}
      showIndex={false}
      showDelete={false}
    />

    {#if isListExhausted}
      <div class="text-center text-sm text-muted-foreground">
        {t('procedure_the_list_is_complete')}
        {#if totalBudgetRemaining > 5}
          {t('procedure_return_to_caucus_setup_to_add_more_speakers')}
        {:else}
          {t('procedure_caucus_ending_soon')}
        {/if}
      </div>
    {/if}
  {:else}
    <div class="flex flex-col items-center gap-4 text-muted-foreground">
      <Timer size={48} class="opacity-30" />
      <p class="text-lg font-medium">{t('procedure_no_meeting_in_progress')}</p>
    </div>
  {/if}
</div>
