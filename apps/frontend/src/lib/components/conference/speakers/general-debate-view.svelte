<script lang="ts">
  import { t } from '$lib/i18n'
  /**
   * general-debate-view.svelte
   * ────────────────────────────
   * 一般性辩论面板 —— 主发言名单的添加/删除/让渡/逐人计时。
   */
  import { onDestroy, onMount } from 'svelte'
  import { get } from 'svelte/store'
  import { Timer, Shuffle, ListPlus } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import ActiveSpeakerCard from '$lib/components/conference/speakers/active-speaker-card.svelte'
  import ReadySpeakerCard from '$lib/components/conference/speakers/ready-speaker-card.svelte'
  import WaitingSpeakerList from '$lib/components/conference/speakers/waiting-speaker-list.svelte'
  import YieldResolutionPanel from '$lib/components/conference/speakers/yield-resolution-panel.svelte'
  import SeatSelector from '$lib/components/conference/common/seat-selector.svelte'
  import {
    currentCommittee,
    addToSpeakersList,
    removeFromSpeakersList,
    readySpeaker,
    startSpeaker,
    pauseSpeaker,
    resumeSpeaker,
    endSpeaker,
    handleYield,
    saveConferencesNow
  } from '$lib/classes/stores/conference/conference-store'
  import { destroyTimer } from '$lib/classes/services/engine/conference-engine'
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
  import type {
    ParticipantSeat,
    YieldType,
    SpeakerDisplayEntry
  } from '$lib/classes/types/conference'
  import { isParticipantSeat } from '$lib/classes/types/delegate'

  // ── 发言队列数据 ──────────────────────────────────────────────
  const conf = $derived($currentCommittee)

  const speakers = $derived<SpeakerDisplayEntry[]>(
    (conf?.speakerLists?.entries ?? []).map((s) => ({
      id: s.id,
      seatId: s.seatId,
      seatName: conf?.seats.find((d) => d.id === s.seatId)?.name ?? '',
      status: s.status,
      allocatedTimeSec: s.allocatedTimeSec
    }))
  )

  const readyEntry = $derived(speakers.find((s) => s.status === 'ready') ?? null)
  const waitingSpeakers = $derived(speakers.filter((s) => s.status === 'waiting'))
  const nextSpeaker = $derived<SpeakerDisplayEntry | null>(
    waitingSpeakers.length > 0 ? waitingSpeakers[0] : null
  )

  // ── 自动 ready ──────────────────────────────────────────────────
  $effect(() => {
    if (!isSpeakerActive && !readyEntry && nextSpeaker && !conf?.yieldPending) {
      readySpeaker(nextSpeaker.id)
      syncDisplay()
    }
  })

  const activeSpeaker = $derived.by(() => {
    const eng = conf?.activeSpeaker
    if (!eng) return null
    const entry = speakers.find((s) => s.id === eng.entryId || s.seatId === eng.entryId)
    if (!entry) return null
    return { ...entry, status: 'speaking' as const }
  })

  const isSpeakerActive = $derived(activeSpeaker !== null)

  // ── 让渡相关 ──────────────────────────────────────────────────
  const yieldPending = $derived(conf?.yieldPending ?? null)

  const activeSpeakerCanYield = $derived.by(() => {
    if (!conf?.activeSpeaker) return false
    const entry = conf?.speakerLists?.entries.find((s) => s.id === conf.activeSpeaker!.entryId)
    return entry?.canYield !== false
  })

  const isYieldAnswering = $derived(
    yieldPending?.yieldType === 'question' && yieldPending?.questionerSeatId != null
  )

  const yieldNote = $derived.by(() => {
    if (isYieldAnswering) {
      const questioner = conf?.seats.find((seat) => seat.id === yieldPending?.questionerSeatId)
      return t('procedure_answering_a_question_from_value_2', { value1: questioner?.name ?? t('procedure_unknown_seat') })
    }
    if (!activeSpeakerCanYield && conf?.activeSpeaker) return t('procedure_yielding_is_unavailable_for_this_speech')
    return undefined
  })

  const listedSeatIds = $derived(conf?.speakerLists?.entries.map((s) => s.seatId) ?? [])

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
    timerId: 'speakers-list',
    tickMs: 100,
    getEngine,
    onExpire() {
      endSpeaker()
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

  // ── 可选席位池（出席 + 未在名单中）───────────────
  const availableSeats = $derived(
    (conf?.seats ?? [])
      .filter(isParticipantSeat)
      .filter((seat) => seat.procedure.attendance === 'present')
      .filter((seat) => !listedSeatIds.includes(seat.id))
  )

  // ── 操作处理 ─────────────────────────────────────────────────
  function addSpeaker(d: ParticipantSeat): void {
    addToSpeakersList(d.id)
    syncDisplay()
  }

  function addAllSpeakers(): void {
    for (const d of availableSeats) {
      addToSpeakersList(d.id)
    }
    syncDisplay()
  }

  function addRandomSpeaker(): void {
    if (availableSeats.length === 0) return
    const idx = Math.floor(Math.random() * availableSeats.length)
    addToSpeakersList(availableSeats[idx].id)
    syncDisplay()
  }

  function beginSpeaking(entryId: string): void {
    const entry = conf?.speakerLists?.entries.find((s) => s.id === entryId)
    if (!entry) return
    startSpeaker(entryId)
    timerState.isPaused = false
    syncDisplay()
  }

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

  function finishSpeaker(yieldType?: YieldType): void {
    timerState.isPaused = false
    if (yieldType) {
      handleYield({ type: yieldType })
    } else {
      endSpeaker()
    }
    syncDisplay()
  }

  // ── 键盘快捷键 ──────────────────────────────────────────────
  let yieldModifier = $state(false)

  function isInInput(el: HTMLElement): boolean {
    const tag = el.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
  }

  function handleSpeakerKeydown(e: KeyboardEvent): void {
    if (isInInput(e.target as HTMLElement)) return
    if (yieldModifier) return

    if (e.key === ' ' && !e.ctrlKey && !e.altKey) {
      e.preventDefault()
      if (isSpeakerActive) {
        // 正在发言 → 暂停 / 继续
        if (timerState.isPaused) {
          resumeSpeaking()
        } else {
          pauseSpeaking()
        }
      } else if (readyEntry) {
        // 准备就绪 → 开始发言
        beginSpeaking(readyEntry.id)
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      if (isSpeakerActive) {
        finishSpeaker()
      } else if (readyEntry) {
        removeFromSpeakersList(readyEntry.id)
        syncDisplay()
      }
    }
  }

  function handleYieldKeydown(e: KeyboardEvent): void {
    if (isInInput(e.target as HTMLElement)) return
    if (e.key.toLowerCase() === 'y' && isSpeakerActive && activeSpeakerCanYield) {
      yieldModifier = true
      return
    }
    if (yieldModifier && isSpeakerActive && activeSpeakerCanYield) {
      e.preventDefault()
      switch (e.key) {
        case '1':
          finishSpeaker('chair')
          break
        case '2':
          finishSpeaker('delegate')
          break
        case '3':
          finishSpeaker('question')
          break
        case '4':
          finishSpeaker('comment')
          break
      }
      yieldModifier = false
    }
  }

  function handleYieldKeyup(e: KeyboardEvent): void {
    if (e.key.toLowerCase() === 'y') yieldModifier = false
  }

  onMount(() => {
    window.addEventListener('keydown', handleYieldKeydown)
    window.addEventListener('keyup', handleYieldKeyup)
    window.addEventListener('keydown', handleSpeakerKeydown)
    return () => {
      window.removeEventListener('keydown', handleYieldKeydown)
      window.removeEventListener('keyup', handleYieldKeyup)
      window.removeEventListener('keydown', handleSpeakerKeydown)
    }
  })

  // ── Cleanup ──────────────────────────────────────────────────
  onDestroy(() => {
    saveConferencesNow()
    destroyTimer('speakers-list')
  })
</script>

<div class="flex w-full flex-col gap-4">
  {#if conf}
    {#if yieldPending}
      {@const originalYieldSeat = conf.seats.find(
        (seat) => seat.id === yieldPending.originalSeatId
      )}
      {@const questionerYieldSeat = conf.seats.find(
        (seat) => seat.id === yieldPending.questionerSeatId
      )}
      <YieldResolutionPanel conference={conf} {yieldPending} />
      {#if isYieldAnswering}
        <div class="mt-4">
          <ActiveSpeakerCard
            seatName={originalYieldSeat?.name ?? t('procedure_unknown_seat')}
            remainingSec={timerState.displayRemaining}
            totalSec={yieldPending.allocatedSec}
            isPaused={timerState.isPaused}
            canYield={false}
            yieldNote={t('procedure_answering_a_question_from_value', { value1: questionerYieldSeat?.name ?? t('procedure_unknown_seat') })}
            onpause={pauseSpeaking}
            onresume={resumeSpeaking}
            onend={() => finishSpeaker()}
          />
        </div>
      {/if}
    {:else if isSpeakerActive && conf.activeSpeaker}
      <ActiveSpeakerCard
        seatName={activeSpeaker!.seatName}
        remainingSec={timerState.displayRemaining}
        totalSec={timerState.displayTotal}
        isPaused={timerState.isPaused}
        canYield={activeSpeakerCanYield}
        {yieldNote}
        onpause={pauseSpeaking}
        onresume={resumeSpeaking}
        onend={() => finishSpeaker()}
        onyield={(type: YieldType) => finishSpeaker(type)}
      />
    {:else if readyEntry}
      <ReadySpeakerCard
        seatName={readyEntry.seatName}
        allocatedTimeSec={readyEntry.allocatedTimeSec}
        onstart={() => beginSpeaking(readyEntry.id)}
        oncancel={() => {
          removeFromSpeakersList(readyEntry.id)
          syncDisplay()
        }}
      />
    {/if}

    {#if !isSpeakerActive}
      <div class="rounded-lg border bg-card p-4">
        <div class="flex items-start gap-3">
          <div class="flex-1">
            <SeatSelector
              seats={conf.participantSeats}
              placeholder={t('procedure_search_seat_names')}
              onselect={addSpeaker}
              resetOnSelect={true}
              presentOnly={true}
              excludeIds={listedSeatIds}
            />
          </div>
          <div class="flex shrink-0 gap-2">
            <Button
              variant="outline"
              size="default"
              title={t('procedure_add_a_randomly_selected_seat_to_the_speakers_list')}
              onclick={addRandomSpeaker}
              disabled={availableSeats.length === 0}
            >
              <Shuffle size={14} />
              {t('procedure_pick_randomly')}
            </Button>
            <Button
              variant="outline"
              size="default"
              title={t('procedure_add_all_present_seats_to_the_speakers_list')}
              onclick={addAllSpeakers}
              disabled={availableSeats.length === 0}
            >
              <ListPlus size={14} />
              {t('procedure_add_all')}
            </Button>
          </div>
        </div>
      </div>
    {/if}

    <WaitingSpeakerList
      title={t('procedure_speakers_queue')}
      speakers={waitingSpeakers}
      showIndex={true}
      showDelete={true}
      emptyMessage={t('procedure_the_speakers_list_is_empty_add_seats_to_continue')}
      disabled={isSpeakerActive}
      ondelete={(id: string) => {
        removeFromSpeakersList(id)
        syncDisplay()
      }}
    />
  {:else}
    <div class="flex flex-col items-center gap-4 text-muted-foreground">
      <Timer size={48} class="opacity-30" />
      <p class="text-lg font-medium">{t('procedure_no_meeting_in_progress')}</p>
    </div>
  {/if}
</div>
