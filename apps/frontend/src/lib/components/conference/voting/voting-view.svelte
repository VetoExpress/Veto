<script lang="ts">
  import { t } from '$lib/i18n'
  import { Vote, Check, X, Minus, SkipForward, ArrowRight } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription
  } from '$lib/components/ui/card/index.js'
  import {
    currentCommittee,
    castVote,
    closeVotingSession,
    tallyVotes
  } from '$lib/classes/stores/conference/conference-store'
  import { calculateMajorityThresholds } from '$lib/classes/services/engine/conference-engine'
  import { cn } from '$lib/classes/utils.js'
  import { isParticipantSeat } from '$lib/classes/types/delegate'

  const conf = $derived($currentCommittee)

  // 找到当前进行中的投票；若无则回退到最近一次已结束的投票（展示结果）
  const activeSession = $derived(
    conf?.votingSessions.find((s) => !s.endedAt) ??
      (() => {
        const ended = conf?.votingSessions
          .filter((s) => s.endedAt)
          .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
        return ended?.[0] ?? null
      })()
  )

  // 获取关联的动议信息
  const targetMotion = $derived(
    activeSession?.targetType === 'motion'
      ? conf?.motions.find((m) => m.id === activeSession.targetId)
      : null
  )
  const documentName = $derived(
    targetMotion?.type === 'substantive_vote'
      ? ((targetMotion as any).documentName as string | undefined)
      : undefined
  )

  const thresholds = $derived(
    conf ? calculateMajorityThresholds(conf.seats.filter(isParticipantSeat)) : null
  )

  const tally = $derived(
    activeSession ? tallyVotes(activeSession.ballots) : { yes: 0, no: 0, abstain: 0 }
  )

  const totalVoted = $derived(tally.yes + tally.no + tally.abstain)

  const currentSeatId = $derived(activeSession?.currentSeatId ?? null)
  const isRound2 = $derived((activeSession?.round ?? 1) === 2)
  const isVotingComplete = $derived(activeSession ? currentSeatId === null : true)

  // 按 sortOrder 排序的出席席位列表
  const presentSeats = $derived(
    conf
      ? conf.seats
          .filter(isParticipantSeat)
          .filter(
            (seat) => seat.procedure.attendance === 'present' && seat.procedure.hasVotingRights
          )
          .sort((a, b) => a.procedure.sortOrder - b.procedure.sortOrder)
      : []
  )

  // 当前正在投票的席位
  const currentSeat = $derived(presentSeats.find((d) => d.id === currentSeatId) ?? null)

  // 当前席位的序号（1-based）
  const currentPosition = $derived(
    currentSeat ? presentSeats.findIndex((d) => d.id === currentSeatId) + 1 : 0
  )

  function handleCloseVoting(): void {
    if (activeSession && !activeSession.endedAt) {
      closeVotingSession(activeSession.id)
    }
  }

  function getVoteLabel(seatId: string): string {
    const ballot = activeSession?.ballots.find((b) => b.seatId === seatId)
    if (!ballot) return ''
    switch (ballot.vote) {
      case 'yes':
        return t('procedure_for')
      case 'no':
        return t('procedure_against')
      case 'abstain':
        return t('procedure_abstain')
      case 'skip':
        return t('procedure_skip')
      default:
        return ''
    }
  }

  function getVoteBadgeVariant(
    seatId: string
  ): 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' {
    const ballot = activeSession?.ballots.find((b) => b.seatId === seatId)
    if (!ballot) return 'outline'
    switch (ballot.vote) {
      case 'yes':
        return 'default'
      case 'no':
        return 'destructive'
      case 'abstain':
        return 'secondary'
      case 'skip':
        return 'outline'
      default:
        return 'outline'
    }
  }
</script>

<div class="flex w-full flex-col gap-6">
  {#if activeSession && conf}
    <!-- ====== 标题 ====== -->
    <div class="text-center">
      {#if documentName}
        <p class="mt-1 text-base font-semibold text-foreground">「{documentName}」</p>
      {/if}
      <p class="mt-1 text-sm text-muted-foreground">
        {t('procedure_vote_majority_heading', { value1: activeSession.majorityRule === 'simple_majority' ? t('procedure_simple_majority') : t('procedure_two_thirds_majority_2') })}
      </p>
    </div>

    <!-- ====== 统计卡片 ====== -->
    {#if thresholds}
      <div class="grid grid-cols-4 gap-3">
        <Card
          class="border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30"
        >
          <CardContent class="p-3 text-center">
            <div class="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{tally.yes}</div>
            <div class="text-[10px] text-muted-foreground">{t('procedure_for')}</div>
          </CardContent>
        </Card>
        <Card class="border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950/30">
          <CardContent class="p-3 text-center">
            <div class="text-2xl font-bold text-red-700 dark:text-red-400">{tally.no}</div>
            <div class="text-[10px] text-muted-foreground">{t('procedure_against')}</div>
          </CardContent>
        </Card>
        <Card class="border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30">
          <CardContent class="p-3 text-center">
            <div class="text-2xl font-bold text-amber-700 dark:text-amber-400">{tally.abstain}</div>
            <div class="text-[10px] text-muted-foreground">{t('procedure_abstain')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="p-3 text-center">
            <div class="text-2xl font-bold text-muted-foreground">
              {totalVoted}/{thresholds.presentCount}
            </div>
            <div class="text-[10px] text-muted-foreground">{t('procedure_voted_present')}</div>
          </CardContent>
        </Card>
      </div>
    {/if}

    <!-- ====== 三态：正在投票 / 投票完成 / 结果展示 ====== -->
    {#if activeSession.result}
      <!-- 状态 ③：结果展示 -->
      <Card
        class={activeSession.result === 'passed'
          ? 'border-emerald-300 bg-emerald-50/30 dark:border-emerald-700 dark:bg-emerald-950/10'
          : 'border-red-300 bg-red-50/30 dark:border-red-700 dark:bg-red-950/10'}
      >
        <CardHeader class="text-center">
          <CardTitle
            class={activeSession.result === 'passed'
              ? 'text-emerald-700 dark:text-emerald-400'
              : 'text-red-700 dark:text-red-400'}
          >
            {#if activeSession.result === 'passed'}
              <Check size={28} class="mx-auto mb-2" />
              {t('procedure_vote_passed')}
            {:else}
              <X size={28} class="mx-auto mb-2" />
              {t('procedure_vote_failed')}
            {/if}
          </CardTitle>
          <CardDescription>
            {t('procedure_vote_cast_count', { value1: activeSession.majorityRule === 'simple_majority' ? t('procedure_simple_majority') : t('procedure_two_thirds_majority_2'), value2: totalVoted })}
          </CardDescription>
        </CardHeader>
      </Card>
    {:else if currentSeat}
      <!-- 状态 ①：正在投票 -->
      <Card class="border-2 border-blue-300 bg-blue-50/30 dark:border-blue-700 dark:bg-blue-950/10">
        <CardHeader class="pb-3 text-center">
          <div class="flex items-center justify-center gap-2">
            <span class="text-xs text-muted-foreground">
              {t('procedure_vote_position', { value1: presentSeats.length, value2: currentPosition })}
            </span>
          </div>
          <CardTitle class="text-2xl">{currentSeat.name}</CardTitle>
          {#if currentSeat.shortName}
            <CardDescription>{currentSeat.shortName}</CardDescription>
          {/if}
        </CardHeader>
        <CardContent>
          <div class="flex items-center justify-center gap-3">
            <Button
              size="lg"
              variant="outline"
              class="h-11 min-w-[100px] gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
              onclick={() => castVote(activeSession.id, currentSeat.id, 'yes')}
            >
              <Check size={18} />
              {t('procedure_for')}
            </Button>
            <Button
              size="lg"
              variant="outline"
              class="h-11 min-w-[100px] gap-2 border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/40"
              onclick={() => castVote(activeSession.id, currentSeat.id, 'no')}
            >
              <X size={18} />
              {t('procedure_against')}
            </Button>
            {#if !isRound2}
              <Button
                size="lg"
                variant="outline"
                class="h-11 min-w-[100px] gap-2 border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/40"
                onclick={() => castVote(activeSession.id, currentSeat.id, 'abstain')}
              >
                <Minus size={18} />
                {t('procedure_abstain')}
              </Button>
              <Button
                size="lg"
                variant="outline"
                class="h-11 min-w-[100px] gap-2 border-slate-300 text-slate-600 hover:bg-slate-50 hover:text-slate-700 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-950/40"
                onclick={() => castVote(activeSession.id, currentSeat.id, 'skip')}
              >
                <SkipForward size={18} />
                {t('procedure_skip')}
              </Button>
            {/if}
          </div>
        </CardContent>
      </Card>
    {:else if isVotingComplete}
      <!-- 状态 ②：投票完成 -->
      <Card
        class="border-emerald-300 bg-emerald-50/30 dark:border-emerald-700 dark:bg-emerald-950/10"
      >
        <CardHeader class="text-center">
          <CardTitle class="text-emerald-700 dark:text-emerald-400">
            <Check size={24} class="mx-auto mb-2" />
            {t('procedure_all_seats_have_voted')}
          </CardTitle>
          <CardDescription>{t('procedure_all_seats_have_voted_you_can_announce_the_result')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="flex justify-center">
            <Button variant="outline" size="lg" class="gap-2" onclick={handleCloseVoting}>
              <Vote size={16} />
              {t('procedure_end_vote_and_announce_result')}
            </Button>
          </div>
        </CardContent>
      </Card>
    {/if}

    <!-- ====== 席位投票列表 ====== -->
    <Card>
      <CardHeader class="pb-2">
        <CardTitle class="text-sm font-medium text-muted-foreground">{t('procedure_voting_record')}</CardTitle>
      </CardHeader>
      <CardContent class="p-0">
        <div class="divide-y">
          {#each presentSeats as seat (seat.id)}
            {@const ballot = activeSession.ballots.find((b) => b.seatId === seat.id)}
            {@const isCurrent = currentSeatId === seat.id}
            {@const hasVoted = !!ballot}
            <div
              class={cn(
                'flex items-center gap-3 px-4 py-2.5 transition-colors',
                isCurrent &&
                  !activeSession.result &&
                  'bg-blue-50/60 ring-1 ring-inset ring-blue-300 dark:bg-blue-950/20 dark:ring-blue-700'
              )}
            >
              <span class="min-w-0 flex-1 text-sm">
                {seat.name}
              </span>
              {#if hasVoted}
                <Badge variant={getVoteBadgeVariant(seat.id)} class="text-xs">
                  {getVoteLabel(seat.id)}
                </Badge>
              {:else if isCurrent && !activeSession.result}
                <Badge variant="outline" class="animate-pulse text-xs">
                  <ArrowRight size={10} class="mr-1" />
                  {t('procedure_voting_in_progress')}
                </Badge>
              {:else}
                <span class="text-xs text-muted-foreground">—</span>
              {/if}
            </div>
          {/each}
        </div>
      </CardContent>
    </Card>
  {:else}
    <!-- 空状态 -->
    <Card>
      <CardContent class="p-12 text-center">
        <Vote size={40} class="mx-auto mb-3 opacity-30" />
        <p class="text-muted-foreground">{t('procedure_no_vote_in_progress')}</p>
        <p class="mt-1 text-xs text-muted-foreground/70">{t('procedure_put_a_motion_to_a_vote_to_begin_voting_here')}</p>
      </CardContent>
    </Card>
  {/if}
</div>
