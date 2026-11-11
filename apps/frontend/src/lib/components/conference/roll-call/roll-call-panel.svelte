<script lang="ts">
  import { t } from '$lib/i18n'
  import { Check, X, Users, Flag } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import {
    currentCommittee,
    changeSeatAttendance,
    completeRollCall
  } from '$lib/classes/stores/conference/conference-store'
  import { calculateMajorityThresholds } from '$lib/classes/services/engine/conference-engine'
  import { cn } from '$lib/classes/utils.js'
  import { isParticipantSeat } from '$lib/classes/types/delegate'

  const conf = $derived($currentCommittee)

  // 按 sortOrder 排序的参会席位列表
  const sortedSeats = $derived(
    conf
      ? conf.seats
          .filter(isParticipantSeat)
          .sort((a, b) => a.procedure.sortOrder - b.procedure.sortOrder)
      : []
  )

  // 当前正在点名的席位索引（0-based）
  let currentIndex = $state(0)

  const currentSeat = $derived(sortedSeats[currentIndex] ?? null)
  const isComplete = $derived(currentIndex >= sortedSeats.length)

  // 实时统计
  const thresholds = $derived(
    conf ? calculateMajorityThresholds(conf.seats.filter(isParticipantSeat)) : null
  )
  const presentCount = $derived(thresholds?.presentCount ?? 0)
  const totalCount = $derived(thresholds?.totalCount ?? 0)
  const progress = $derived(totalCount > 0 ? Math.round((currentIndex / totalCount) * 100) : 0)

  function markPresent(): void {
    if (!currentSeat) return
    changeSeatAttendance(currentSeat.id, 'present', { silent: true })
    currentIndex++
  }

  function markAbsent(): void {
    if (!currentSeat) return
    changeSeatAttendance(currentSeat.id, 'absent', { silent: true })
    currentIndex++
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (isComplete) return
    if (e.key === 'p' || e.key === 'P' || e.key === 'ArrowLeft') {
      markPresent()
    } else if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowRight') {
      markAbsent()
    }
  }

  function handleComplete(): void {
    completeRollCall()
  }

  // 后退一步
  function goBack(): void {
    if (currentIndex <= 0) return
    currentIndex--
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="flex h-full w-full flex-col items-center justify-center">
  {#if conf && thresholds}
    {#if !isComplete}
      <!-- ===== 逐个点名视图 ===== -->
      <div class="flex w-full max-w-lg flex-col items-center gap-10">
        <!-- 进度条 + 计数 -->
        <div class="flex w-full flex-col items-center gap-2">
          <div class="flex items-center gap-3 text-sm text-muted-foreground">
            <Users size={14} />
            <span>{t('procedure_roll_call_progress', { value1: currentIndex + 1, value2: totalCount })}</span>
          </div>
          <!-- 进度条 -->
          <div class="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              class="h-full rounded-full bg-indigo-500 transition-all duration-300"
              style="width: {progress}%"
            ></div>
          </div>
          <!-- 实时统计 -->
          <div class="flex gap-4 text-xs text-muted-foreground">
            <span>{t('procedure_present')} <span class="font-semibold text-emerald-600">{presentCount}</span></span>
            <span>{t('procedure_simple_majority')} <span class="font-semibold text-amber-600">{thresholds.simpleMajorityThreshold}</span></span>
            <span>{t('procedure_two_thirds_majority_2')} <span class="font-semibold text-rose-600">{thresholds.twoThirdsThreshold}</span></span>
          </div>
        </div>

        <!-- 当前席位卡片 -->
        {#if currentSeat}
          <div class="flex w-full flex-col items-center gap-6 rounded-2xl border-2 border-indigo-200 bg-card p-12 shadow-lg dark:border-indigo-800">
            <!-- 国旗/色块 -->
            <div
              class="flex h-24 w-24 items-center justify-center rounded-full border-4 border-border text-3xl font-bold text-foreground shadow-inner bg-muted"
            >
              {#if currentSeat.procedure.flagUrl}
                <img src={currentSeat.procedure.flagUrl} alt="" class="h-full w-full rounded-full object-cover" />
              {:else}
                {currentSeat.shortName?.charAt(0) ?? currentSeat.name.charAt(0)}
              {/if}
            </div>

            <!-- 名称 -->
            <div class="text-center">
              <div class="text-3xl font-bold text-foreground">{currentSeat.name}</div>
              {#if currentSeat.shortName}
                <div class="mt-1 text-lg text-muted-foreground">{currentSeat.shortName}</div>
              {/if}
            </div>

            <!-- 操作按钮 -->
            <div class="flex gap-4">
              <Button
                size="lg"
                class="min-w-[140px] gap-2 bg-emerald-600 text-base hover:bg-emerald-700"
                onclick={markPresent}
              >
                <Check size={20} />
                {t('procedure_present_2')}
                <span class="text-xs opacity-60">P</span>
              </Button>
              <Button
                size="lg"
                variant="outline"
                class="min-w-[140px] gap-2 text-base"
                onclick={markAbsent}
              >
                <X size={20} />
                {t('procedure_absent')}
                <span class="text-xs opacity-40">A</span>
              </Button>
            </div>

            <!-- 返回上一步 -->
            {#if currentIndex > 0}
              <button
                class="text-xs text-muted-foreground hover:text-foreground"
                onclick={goBack}
              >
                {t('procedure_previous_seat')}
              </button>
            {/if}
          </div>
        {/if}
      </div>

    {:else}
      <!-- ===== 点名完成视图 ===== -->
      <div class="flex w-full max-w-lg flex-col items-center gap-8">
        <div class="flex items-center gap-2">
          <Flag size={24} class="text-indigo-500" />
          <h2 class="text-2xl font-bold text-foreground">{t('procedure_roll_call_complete')}</h2>
        </div>

        <!-- 统计卡片 -->
        <div class="grid w-full grid-cols-3 gap-4">
          <div class="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-800 dark:bg-emerald-950/30">
            <div class="text-3xl font-bold text-emerald-700 dark:text-emerald-400">{presentCount}</div>
            <div class="mt-1 text-sm text-muted-foreground">{t('procedure_roll_call_present_total', { value1: totalCount })}</div>
          </div>
          <div class="rounded-xl border-2 border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-800 dark:bg-amber-950/30">
            <div class="text-3xl font-bold text-amber-700 dark:text-amber-400">{thresholds.simpleMajorityThreshold}</div>
            <div class="mt-1 text-sm text-muted-foreground">{t('procedure_simple_majority')}</div>
          </div>
          <div class="rounded-xl border-2 border-rose-200 bg-rose-50 p-6 text-center dark:border-rose-800 dark:bg-rose-950/30">
            <div class="text-3xl font-bold text-rose-700 dark:text-rose-400">{thresholds.twoThirdsThreshold}</div>
            <div class="mt-1 text-sm text-muted-foreground">{t('procedure_two_thirds_majority')}</div>
          </div>
        </div>

        <!-- 点名结果摘要 -->
        <div class="w-full rounded-xl border bg-card">
          <div class="divide-y px-6">
            {#each sortedSeats as seat (seat.id)}
              {@const isPresent = seat.procedure.attendance === 'present'}
              <div class="flex items-center gap-3 py-2.5">
                <span class={cn('flex-1 text-sm', isPresent ? 'text-foreground' : 'text-muted-foreground/50 line-through')}>
                  {seat.name}
                </span>
                <span class={cn('text-xs font-medium', isPresent ? 'text-emerald-600' : 'text-muted-foreground')}>
                  {isPresent ? t('procedure_present_2') : t('procedure_absent')}
                </span>
              </div>
            {/each}
          </div>
        </div>

        <!-- 返回修改 + 完成 -->
        <div class="flex gap-4">
          <Button
            variant="outline"
            size="lg"
            onclick={goBack}
          >
            {t('procedure_back_to_edit')}
          </Button>
          <Button
            size="lg"
            class="min-w-[160px] gap-2 bg-indigo-600 text-base hover:bg-indigo-700"
            onclick={handleComplete}
          >
            <Flag size={18} />
            {t('procedure_complete_roll_call')}
          </Button>
        </div>
      </div>
    {/if}
  {/if}
</div>
