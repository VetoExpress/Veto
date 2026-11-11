<script lang="ts">
  import { t } from '$lib/i18n'
  /**
   * caucus-setup-view.svelte
   * ─────────────────────────
   * 磋商发言名单设置面板（caucus_setup phase）。
   * 主席团设置动议席位标首/标尾，添加发言席位。
   */
  import { Users, Play, GripVertical } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import { Separator } from '$lib/components/ui/separator/index.js'
  import { currentCommittee } from '$lib/classes/stores/conference/conference-store'
  import {
    setCaucusProposerPosition,
    addToCaucusSpeakers,
    removeFromCaucusSpeakers,
    startCaucusWithSetup,
    endCaucus
  } from '$lib/classes/stores/conference/conference-store'
  import SeatSelector from '$lib/components/conference/common/seat-selector.svelte'
  import type { ParticipantSeat } from '$lib/classes/types/conference'

  const conf = $derived($currentCommittee)
  const setup = $derived(conf?.caucusSetup ?? null)
  const motion = $derived(setup ? conf?.motions.find((m) => m.id === setup.motionId) : null)
  const proposerSeat = $derived(
    motion
      ? (conf?.participantSeats.find((seat) => seat.id === motion.proposedBySeatId) ?? null)
      : null
  )

  // 已在名单中的席位 ID（用于排除）
  const listedIds = $derived(setup?.speakerSeatIds ?? [])

  // 容量计算：总时间 / 每人发言时间 = 最多可容纳代表数
  const perSpeakerSec = $derived((motion as any)?.speakingTimePerPersonSec ?? 60)
  const totalSec = $derived(setup?.remainingSec ?? (motion as any)?.totalTimeSec ?? 0)
  const maxSpeakers = $derived(Math.max(1, Math.floor(totalSec / perSpeakerSec)))
  const isAtCapacity = $derived(listedIds.length >= maxSpeakers)

  function handleAdd(d: ParticipantSeat): void {
    addToCaucusSpeakers(d.id)
  }

  function handleRemove(seatId: string): void {
    removeFromCaucusSpeakers(seatId)
  }

  function togglePosition(): void {
    if (!setup) return
    setCaucusProposerPosition(setup.proposerPosition === 'first' ? 'last' : 'first')
  }

  function handleStart(): void {
    startCaucusWithSetup()
  }
</script>

<div class="flex w-full flex-col gap-6">
  {#if conf && setup && motion}
    <!-- 动议信息摘要 -->
    <div
      class="rounded-lg border-2 border-indigo-300 bg-indigo-50 p-5 text-center dark:border-indigo-700 dark:bg-indigo-950/30"
    >
      {#if setup.remainingSec != null}
        <div class="text-sm font-medium text-amber-700 dark:text-amber-400">
          {t('procedure_list_complete_add_more_speakers')}
        </div>
      {:else}
        <div class="text-sm font-medium text-indigo-700 dark:text-indigo-400">
          {t('procedure_motion_approved_set_up_the_caucus_speakers_list')}
        </div>
      {/if}
      <div class="mt-2 text-xl font-bold text-foreground">
        {(motion as any).topic ?? t('procedure_moderated_caucus')}
      </div>
      <div class="mt-1 text-sm text-muted-foreground">
        {#if setup.remainingSec != null}
          {t('procedure_caucus_remaining_per_speaker', { value1: setup.remainingSec, value2: (motion as any).speakingTimePerPersonSec })}
        {:else}
          {t('procedure_caucus_total_per_speaker', { value1: (motion as any).totalTimeSec, value2: (motion as any).speakingTimePerPersonSec })}
        {/if}
      </div>
    </div>
    <!-- 开始磋商 -->
    <div class="flex justify-center gap-4">
      <Button size="lg" class="gap-2 min-w-[200px]" onclick={handleStart}>
        <Play size={18} />
        {t('procedure_start_caucus')}
      </Button>
      <Button size="lg" variant="destructive" class="gap-2 min-w-[200px]" onclick={endCaucus}>
        <Play size={18} />
        {t('procedure_end_caucus')}
      </Button>
    </div>
    <!-- 动议国位置 -->
    <div class="rounded-lg border bg-card p-4">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-sm font-medium text-foreground">{t('procedure_proposer_speaking_position')}</div>
          <div class="mt-0.5 text-xs text-muted-foreground">
            {proposerSeat?.name ?? t('procedure_motion_proposer')}
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Button
            size="sm"
            variant={setup.proposerPosition === 'first' ? 'default' : 'outline'}
            class="h-8 text-xs"
            onclick={togglePosition}
          >
            {t('procedure_first_speaker')}
          </Button>
          <Button
            size="sm"
            variant={setup.proposerPosition === 'last' ? 'default' : 'outline'}
            class="h-8 text-xs"
            onclick={togglePosition}
          >
            {t('procedure_last_speaker')}
          </Button>
        </div>
      </div>
    </div>

    <!-- 添加发言席位 -->
    <div class="rounded-lg border bg-card p-4">
      <div class="flex items-center gap-2">
        <Users size={16} class="text-muted-foreground" />
        <span class="text-sm font-medium text-foreground">{t('procedure_add_speaker')}</span>
        <span class="ml-auto text-xs text-muted-foreground">
          {t('procedure_caucus_capacity_added', { value1: maxSpeakers, value2: listedIds.length })}
        </span>
      </div>
      <div class="mt-3">
        {#if isAtCapacity}
          <div
            class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400"
          >
            {t('procedure_caucus_capacity_full', { value1: totalSec, value2: perSpeakerSec, value3: maxSpeakers })}
          </div>
        {:else}
          <SeatSelector
            seats={conf.participantSeats}
            placeholder={t('procedure_search_and_add_seats')}
            resetOnSelect={true}
            excludeIds={listedIds}
            onselect={handleAdd}
          />
        {/if}
      </div>
    </div>

    <!-- 当前发言名单 -->
    <div class="rounded-lg border bg-card">
      <div class="flex items-center gap-2 px-4 py-3">
        <GripVertical size={14} class="text-muted-foreground" />
        <span class="text-sm font-medium text-foreground">
          {t('procedure_caucus_list_count', { value1: listedIds.length, value2: maxSpeakers })}
        </span>
      </div>

      {#if listedIds.length === 0}
        <div class="px-4 pb-4 text-center text-xs text-muted-foreground">{t('procedure_the_list_is_empty_add_seats_to_continue')}</div>
      {:else}
        <div class="divide-y">
          {#each listedIds as delId, i}
            {@const del = conf.seats.find((d) => d.id === delId)}
            {#if del}
              <div class="flex items-center gap-3 px-4 py-2.5">
                <span class="w-6 text-right font-mono text-xs text-muted-foreground">{i + 1}</span>
                <span class="min-w-0 flex-1 text-sm text-foreground">{del.name}</span>
                {#if proposerSeat?.id === delId}
                  <Badge variant="outline" class="text-[10px]">{t('procedure_proposing_seat')}</Badge>
                {/if}
                <Button
                  size="sm"
                  variant="ghost"
                  class="h-7 text-xs text-muted-foreground hover:text-red-500"
                  onclick={() => handleRemove(delId)}
                >
                  {t('procedure_remove')}
                </Button>
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    </div>

    <Separator />
  {:else}
    <div class="flex flex-col items-center gap-4 text-muted-foreground">
      <Users size={48} class="opacity-30" />
      <p class="text-lg font-medium">{t('procedure_caucus_setup_is_not_ready')}</p>
    </div>
  {/if}
</div>
