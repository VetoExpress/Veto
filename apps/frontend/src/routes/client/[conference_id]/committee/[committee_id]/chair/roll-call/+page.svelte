<script lang="ts">
  import { t, formatNumber } from '$lib/i18n'
  import { onDestroy } from 'svelte'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { Check, X, Users } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button'
  import {
    currentCommittee,
    changeSeatAttendance,
    completeRollCall
  } from '$lib/classes/stores/conference/conference-store'
  import {
    calculateQuorum,
    defaultProcedureRules,
    thresholdCount
  } from '$lib/classes/utils/committee/procedure-rules'
  import { VETO_NAME, ROLL_CALL_MARK_DELAY } from '$lib/classes/const'
  import type { Attendance, ParticipantSeat } from '$lib/classes/types/conference'
  import { isParticipantSeat, toSeatView } from '$lib/classes/types/delegate'
  import PageTopBar from '$lib/components/conference/common/page-top-bar.svelte'
  import {
    chairDisplayExtra,
    resetChairDisplayExtra
  } from '$lib/classes/stores/conference/chair-display-store'

  const conferenceId = $derived(page.params.conference_id ?? null)
  const committeeId = $derived(page.params.committee_id ?? null)

  onDestroy(() => {
    if (transitionTimeout) clearTimeout(transitionTimeout)
    resetChairDisplayExtra()
  })

  // 刚标记的席位（传给 Display 端展示确认动画，发送后即清除）
  let lastRollCallMarked = $state<{
    seat: ParticipantSeat
    status: Attendance
    index: number
  } | null>(null)

  // 将点名页面的附加投影交给 chair layout 统一发送到 Display。
  $effect(() => {
    const rollCallInfo = quorum
      ? {
          currentIndex,
          totalCount,
          presentCount,
          quorum,
          simpleMajorityThreshold: thresholdCount(votingCount, { type: 'simple_majority' }),
          twoThirdsThreshold: thresholdCount(votingCount, { type: 'two_thirds' }),
          ...(currentSeat ? { currentSeat: toSeatView(currentSeat) } : {}),
          lastMarked: lastRollCallMarked
            ? { ...lastRollCallMarked, seat: toSeatView(lastRollCallMarked.seat) }
            : undefined
        }
      : undefined

    chairDisplayExtra.set({ rollCall: rollCallInfo })
  })

  const conf = $derived($currentCommittee)

  const sortedSeats = $derived(
    conf
      ? conf.seats
          .filter(isParticipantSeat)
          .sort((a, b) => a.procedure.sortOrder - b.procedure.sortOrder)
      : []
  )

  let currentIndex = $state(0)
  let isTransitioning = $state(false)
  let transitionTimeout: ReturnType<typeof setTimeout> | null = null

  const currentSeat = $derived(sortedSeats[currentIndex] ?? null)
  const isComplete = $derived(currentIndex >= sortedSeats.length)

  const quorum = $derived(
    conf
      ? calculateQuorum(
          sortedSeats,
          (conf.procedureRules ?? defaultProcedureRules(conf.substantiveVotingMajority)).quorum
        )
      : null
  )
  const presentCount = $derived(
    sortedSeats.filter((seat) => seat.procedure.attendance === 'present').length
  )
  const votingCount = $derived(
    sortedSeats.filter(
      (seat) => seat.procedure.attendance === 'present' && seat.procedure.hasVotingRights
    ).length
  )
  const totalCount = $derived(sortedSeats.length)
  const progress = $derived(totalCount > 0 ? Math.round((currentIndex / totalCount) * 100) : 0)

  const showConfirmOverlay = $derived(isTransitioning && lastRollCallMarked !== null)
  const absentSeats = $derived(
    sortedSeats.filter((seat) => seat.procedure.attendance !== 'present')
  )

  function markPresent(): void {
    if (!currentSeat || isTransitioning) return
    changeSeatAttendance(currentSeat.id, 'present', { silent: true })
    lastRollCallMarked = {
      seat: currentSeat,
      status: 'present',
      index: currentIndex
    }
    isTransitioning = true
    transitionTimeout = setTimeout(() => {
      isTransitioning = false
      lastRollCallMarked = null
      currentIndex++
    }, ROLL_CALL_MARK_DELAY)
  }

  function markAbsent(): void {
    if (!currentSeat || isTransitioning) return
    changeSeatAttendance(currentSeat.id, 'absent', { silent: true })
    lastRollCallMarked = {
      seat: currentSeat,
      status: 'absent',
      index: currentIndex
    }
    isTransitioning = true
    transitionTimeout = setTimeout(() => {
      isTransitioning = false
      lastRollCallMarked = null
      currentIndex++
    }, ROLL_CALL_MARK_DELAY)
  }

  function markAllPresent(): void {
    if (!conf || isTransitioning) return
    const remaining = sortedSeats.slice(currentIndex)
    for (const d of remaining) {
      changeSeatAttendance(d.id, 'present', { silent: true })
    }
    currentIndex = sortedSeats.length
  }

  function markAllAbsent(): void {
    if (!conf || isTransitioning) return
    const remaining = sortedSeats.slice(currentIndex)
    for (const d of remaining) {
      changeSeatAttendance(d.id, 'absent', { silent: true })
    }
    currentIndex = sortedSeats.length
  }

  function goBack(): void {
    if (currentIndex <= 0 || isTransitioning) return
    if (transitionTimeout) clearTimeout(transitionTimeout)
    isTransitioning = false
    lastRollCallMarked = null
    currentIndex--
  }

  function handleComplete(): void {
    if (!quorum?.met) return
    if (completeRollCall()) {
      goto(resolve(`/client/${conferenceId}/committee/${committeeId}/chair`))
    }
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (isComplete || isTransitioning) return
    if (e.key === 'p' || e.key === 'P' || e.key === 'ArrowLeft') {
      markPresent()
    } else if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowRight') {
      markAbsent()
    } else if (e.key === 'Backspace') {
      goBack()
    }
  }
</script>

<svelte:head>
  <title>{t('procedure_roll_call_page_title', { value1: VETO_NAME })}</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="flex h-full w-full flex-col bg-background">
  <PageTopBar
    title={t('procedure_roll_call_2')}
    subtitle={conf?.name}
    backHref={resolve(`/client/${conferenceId}/committee/${committeeId}/chair`)}
  />

  <!-- 内容 -->
  <div class="flex flex-1 items-center justify-center overflow-hidden p-6">
    {#if conf && quorum}
      {#if !isComplete}
        <!-- ===== 逐个点名 ===== -->
        <div class="flex w-full max-w-lg flex-col items-center gap-10">
          <p role="status" class={['text-center text-sm', { 'text-destructive': !quorum.met }]}>
            {t(quorum.met ? 'components_quorum_met' : 'components_quorum_unmet')}
            {t('components_quorum_summary', {
              present: formatNumber(quorum.present),
              denominator: formatNumber(quorum.denominator),
              required: formatNumber(quorum.required)
            })}
          </p>

          <!-- 进度 -->
          <div class="flex w-full flex-col items-center gap-2">
            <div class="flex items-center gap-3 text-sm text-muted-foreground">
              <Users size={14} />
              <span>
                {t('procedure_roll_call_position', {
                  value1: currentIndex + 1,
                  value2: totalCount
                })}
              </span>
            </div>
            <div class="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                class="h-full rounded-full bg-foreground/25 transition-all duration-300"
                style="width: {progress}%"
              ></div>
            </div>
            <div class="flex gap-4 text-xs text-muted-foreground">
              <span>
                {t('procedure_present')}
                <span class="font-semibold text-foreground">{presentCount}</span>
              </span>
              <span>
                {t('components_quorum_denominator')}
                <span class="font-semibold text-foreground">
                  {formatNumber(quorum.denominator)}
                </span>
              </span>
              <span>
                {t('components_quorum_required')}
                <span class="font-semibold text-foreground">
                  {formatNumber(quorum.required)}
                </span>
              </span>
            </div>
          </div>

          <!-- 当前席位 -->
          {#if currentSeat}
            <div
              class="relative flex w-full flex-col items-center gap-6 rounded-lg border bg-card p-14 transition-all duration-500 {isTransitioning
                ? 'opacity-70'
                : ''}"
            >
              <!-- 席位信息 -->

              <div
                class={[
                  'text-center transition-opacity duration-300',
                  { 'opacity-30': isTransitioning }
                ]}
              >
                <div class="text-3xl font-bold text-foreground">{currentSeat.name}</div>
                {#if currentSeat.shortName}
                  <div class="mt-1 text-lg text-muted-foreground">{currentSeat.shortName}</div>
                {/if}
              </div>

              {#if !isTransitioning}
                <div class="mt-2 flex gap-4">
                  <Button
                    size="lg"
                    class="min-w-[160px] gap-2 text-base"
                    onclick={markPresent}
                    disabled={isTransitioning}
                  >
                    <Check size={20} />
                    {t('procedure_present_2')}
                    <span class="text-xs opacity-60">P</span>
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    class="min-w-[160px] gap-2 text-base"
                    onclick={markAbsent}
                    disabled={isTransitioning}
                  >
                    <X size={20} />
                    {t('procedure_absent')}
                    <span class="text-xs opacity-40">A</span>
                  </Button>
                </div>
              {:else if showConfirmOverlay && lastRollCallMarked}
                <!-- 点名结果 -->
                <div class="mt-2 flex flex-col items-center gap-2">
                  <span class="text-lg font-bold text-foreground">
                    {lastRollCallMarked.status === 'present'
                      ? t('procedure_present_2')
                      : t('procedure_absent')}
                  </span>
                </div>
              {/if}

              {#if currentIndex > 0}
                <button
                  class="text-xs text-muted-foreground hover:text-foreground"
                  onclick={goBack}
                  disabled={isTransitioning}
                >
                  {t('procedure_backspace_previous_seat')}
                </button>
              {/if}
            </div>
          {/if}

          <!-- 快捷操作 -->
          <div class="flex gap-3">
            <Button
              size="sm"
              variant="outline"
              class="gap-1.5 text-xs"
              onclick={markAllPresent}
              disabled={isTransitioning || currentIndex >= sortedSeats.length}
            >
              <Check size={12} />
              {t('procedure_mark_all_present')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              class="gap-1.5 text-xs"
              onclick={markAllAbsent}
              disabled={isTransitioning || currentIndex >= sortedSeats.length}
            >
              <X size={12} />
              {t('procedure_mark_all_absent')}
            </Button>
          </div>
        </div>
      {:else}
        <!-- ===== 点名完成 ===== -->
        <div class="flex w-full max-w-lg flex-col items-center gap-8">
          <p role="status" class={['text-center text-sm', { 'text-destructive': !quorum.met }]}>
            {t(quorum.met ? 'components_quorum_met' : 'components_quorum_unmet')}
            {t('components_quorum_summary', {
              present: formatNumber(quorum.present),
              denominator: formatNumber(quorum.denominator),
              required: formatNumber(quorum.required)
            })}
          </p>

          <div class="flex items-center gap-2">
            <h2 class="text-2xl font-bold text-foreground">{t('procedure_roll_call_complete')}</h2>
          </div>

          <div class="grid w-full grid-cols-3 gap-4">
            <div class="rounded-lg border bg-card p-6 text-center">
              <div class="text-3xl font-bold text-foreground">{presentCount}</div>
              <div class="mt-1 text-sm text-muted-foreground">
                {t('procedure_roll_call_present_total', { value1: totalCount })}
              </div>
            </div>
            <div class="rounded-lg border bg-card p-6 text-center">
              <div class="text-3xl font-bold text-foreground">
                {formatNumber(quorum.denominator)}
              </div>
              <div class="mt-1 text-sm text-muted-foreground">
                {t('components_quorum_denominator')}
              </div>
            </div>
            <div class="rounded-lg border bg-card p-6 text-center">
              <div class="text-3xl font-bold text-foreground">{formatNumber(quorum.required)}</div>
              <div class="mt-1 text-sm text-muted-foreground">
                {t('components_quorum_required')}
              </div>
            </div>
          </div>

          <!-- 未出席列表 -->
          {#if absentSeats.length > 0}
            <div class="w-full rounded-xl border bg-card">
              <div class="px-6 py-3 text-xs font-medium text-muted-foreground">
                {t('procedure_roll_call_absent_count', { value1: absentSeats.length })}
              </div>
              <div class="divide-y px-6">
                {#each absentSeats as seat (seat.id)}
                  <div class="flex items-center gap-3 py-2.5">
                    <span class="flex-1 text-sm text-muted-foreground/70">
                      {seat.shortName ?? seat.name}
                    </span>
                    <span class="text-xs text-muted-foreground">{t('procedure_absent')}</span>
                  </div>
                {/each}
              </div>
            </div>
          {:else}
            <p class="text-sm font-medium">{t('procedure_mark_all_present')}</p>
          {/if}

          <div class="flex gap-4">
            <Button variant="outline" size="lg" onclick={goBack}>
              {t('procedure_back_to_edit')}
            </Button>
            <Button
              size="lg"
              class="min-w-[160px] gap-2 text-base"
              onclick={handleComplete}
              disabled={!quorum.met}
            >
              {t('procedure_complete_roll_call')}
            </Button>
          </div>
        </div>
      {/if}
    {:else}
      <div class="flex flex-col items-center gap-3 text-muted-foreground">
        <Users size={40} class="opacity-30" />
        <p class="text-lg font-medium">{t('procedure_no_participants_found')}</p>
        <p class="text-sm opacity-70">
          {t('procedure_configure_participants_in_seat_management_first')}
        </p>
      </div>
    {/if}
  </div>
</div>
