<script lang="ts">
  import { t, formatNumber } from '$lib/i18n'
  /**
   * conference/[conference_id]/motion.svelte
   * ─────────────────────────────────────────
   * 动议表决页 —— 类似 roll-call 的单开页面。
   *
   * 当动议提交后导航至此页，主席团观察举牌后手动裁决。
   */
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import {
    Presentation,
    Timer,
    MessageSquare,
    Pencil,
    Gavel,
    Coffee,
    LogOut,
    Check,
    X,
    Vote
  } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button'
  import { Separator } from '$lib/components/ui/separator'
  import {
    currentCommittee,
    approveMotion,
    rejectMotion
  } from '$lib/classes/stores/conference/conference-store'
  import {
    defaultProcedureRules,
    proceduralThreshold,
    thresholdCount
  } from '$lib/classes/utils/committee/procedure-rules'
  import { isParticipantSeat } from '$lib/classes/types/delegate'
  import { resolveMotion } from '$lib/classes/services/engine/conference-engine'
  import { MOTION_LABELS } from '$lib/classes/types/conference'
  import { VETO_NAME } from '$lib/classes/const'
  import PageTopBar from '$lib/components/conference/common/page-top-bar.svelte'

  const conferenceId = $derived(page.params.conference_id ?? null)
  const committeeId = $derived(page.params.committee_id ?? null)

  const conf = $derived($currentCommittee)

  const MOTION_ICONS: Record<string, typeof Presentation> = {
    open_speakers_list: Presentation,
    moderated_caucus: MessageSquare,
    unmoderated_caucus: Coffee,
    moderated_debate: MessageSquare,
    unmoderated_debate: MessageSquare,
    modify_speaking_time: Pencil,
    closure_debate: Gavel,
    suspend_meeting: Timer,
    close_meeting: LogOut,
    substantive_vote: Vote
  }

  const pendingMotion = $derived(conf?.motions.find((m) => m.status === 'pending') ?? null)

  const resolution = $derived(pendingMotion ? resolveMotion(pendingMotion.type) : null)

  const proposerDel = $derived(
    pendingMotion
      ? (conf?.seats.find((seat) => seat.id === pendingMotion.proposedBySeatId) ?? null)
      : null
  )

  const rules = $derived(
    conf?.procedureRules ?? defaultProcedureRules(conf?.substantiveVotingMajority)
  )
  const threshold = $derived(
    proceduralThreshold(rules, pendingMotion?.type, resolution?.votingMajority)
  )
  const denominator = $derived(
    conf?.seats
      .filter(isParticipantSeat)
      .filter(
        (seat) =>
          seat.procedure.attendance === 'present' &&
          (rules.proceduralVote.denominator === 'present_participants' ||
            seat.procedure.hasVotingRights)
      ).length ?? 0
  )
  const majorityLabel = $derived(
    threshold.type === 'fixed'
      ? t('components_threshold_fixed', { count: formatNumber(threshold.value) })
      : t(
          threshold.type === 'simple_majority'
            ? 'components_simple_majority'
            : 'components_two_thirds_majority'
        )
  )

  function handleApprove(): void {
    if (!pendingMotion) return
    approveMotion(pendingMotion.id)
    goBack()
  }

  function handleReject(): void {
    if (!pendingMotion) return
    rejectMotion(pendingMotion.id)
    goBack()
  }

  function goBack(): void {
    if (conf) {
      goto(resolve(`/client/${conferenceId}/committee/${committeeId}/chair`))
    }
  }

  // 如果没有待表决动议，自动返回
  $effect(() => {
    if (conf && !pendingMotion) {
      // 检查是否有刚被处理的动议（短暂延迟后返回）
      const hasProcessedMotion = conf.motions.some(
        (m) => m.status === 'approved' || m.status === 'rejected'
      )
      if (!hasProcessedMotion) {
        goto(resolve(`/client/${conferenceId}/committee/${committeeId}/chair`))
      }
    }
  })
</script>

<svelte:head>
  <title>{t('procedure_motion_page_title', { value1: VETO_NAME })}</title>
</svelte:head>

<div class="flex h-full w-full flex-col bg-background">
  {#if conf && pendingMotion}
    {@const Icon = MOTION_ICONS[pendingMotion.type] ?? Presentation}
    <PageTopBar
      icon={Icon}
      title={t('procedure_motion_vote_2')}
      subtitle={conf.name}
      backHref={resolve(`/client/${conferenceId}/committee/${committeeId}/chair`)}
    />

    <!-- 主内容 -->
    <div class="flex flex-1 items-center justify-center p-8">
      <div class="flex w-full max-w-xl flex-col gap-6">
        <!-- 动议详情 -->
        <div
          class="rounded-lg border-2 border-indigo-300 bg-indigo-50 p-8 text-center dark:border-indigo-700 dark:bg-indigo-950/30"
        >
          <div class="flex items-center justify-center gap-2">
            <Icon size={24} class="text-indigo-600 dark:text-indigo-400" />
            <span class="text-lg font-semibold text-indigo-700 dark:text-indigo-400">
              {t('procedure_motion_ruling')}
            </span>
          </div>

          <div class="mt-4 space-y-2">
            <div class="text-2xl font-bold text-foreground">
              {MOTION_LABELS[pendingMotion.type]}
            </div>
            <div class="text-base text-muted-foreground">
              {t('procedure_motion_proposed_by_name', { name: proposerDel?.name ?? '' })}
            </div>

            {#if pendingMotion.type === 'moderated_caucus'}
              <div
                class="mt-3 rounded-md bg-background/50 px-4 py-2.5 text-sm text-muted-foreground"
              >
                <p>
                  {t('procedure_topic')}
                  <span class="font-medium text-foreground">{(pendingMotion as any).topic}</span>
                </p>
                <p class="mt-0.5">
                  {t('procedure_caucus_motion_summary', {
                    minutes: (pendingMotion as any).totalTimeSec / 60,
                    seconds: (pendingMotion as any).speakingTimePerPersonSec,
                    speakers: (pendingMotion as any).maxSpeakers
                  })}
                </p>
              </div>
            {:else if pendingMotion.type === 'moderated_debate'}
              <div
                class="mt-3 rounded-md bg-background/50 px-4 py-2.5 text-sm text-muted-foreground"
              >
                <p>
                  {t('procedure_topic')}
                  <span class="font-medium text-foreground">{pendingMotion.topic}</span>
                </p>
                <p class="mt-0.5">
                  {t('procedure_motion_duration', { value1: pendingMotion.durationSec / 60 })}
                </p>
              </div>
            {:else if pendingMotion.type === 'unmoderated_caucus' || pendingMotion.type === 'unmoderated_debate'}
              <div class="mt-3 text-sm text-muted-foreground">
                {t('procedure_motion_duration', {
                  value1: (pendingMotion as any).durationSec / 60
                })}
              </div>
            {:else if pendingMotion.type === 'modify_speaking_time'}
              <div class="mt-3 text-sm text-muted-foreground">
                {t('procedure_new_speaking_time')}
                <span class="font-medium text-foreground">
                  {t('procedure_duration_seconds', { value1: (pendingMotion as any).newTimeSec })}
                </span>
              </div>
            {:else if pendingMotion.type === 'closure_debate'}
              <div class="mt-3 text-sm text-muted-foreground">
                {t('procedure_close_debate_on_the_current_topic_then_start_the_pre_vote_roll_call')}
              </div>
            {:else if pendingMotion.type === 'substantive_vote'}
              <div
                class="mt-3 rounded-md bg-background/50 px-4 py-2.5 text-sm text-muted-foreground"
              >
                <span class="font-medium text-foreground">
                  {(pendingMotion as any).documentName}
                </span>
              </div>
            {/if}
          </div>

          <div
            class="mt-4 inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-400"
          >
            {t('procedure_motion_voting_rule', { value1: majorityLabel })}
            {t(
              rules.proceduralVote.denominator === 'present_participants'
                ? 'components_basis_present_participants'
                : 'components_basis_present_voting_eligible'
            )}
            {t('components_vote_threshold_summary', {
              denominator: formatNumber(denominator),
              required: formatNumber(thresholdCount(denominator, threshold))
            })}
          </div>
        </div>

        <Separator />

        <!-- 主席裁决 -->
        <div class="text-center">
          <p class="text-base font-medium text-foreground">
            {t('procedure_seats_supporting_this_motion_please_raise_your_placards')}
          </p>
          <p class="mt-1 text-sm text-muted-foreground">
            {t('procedure_the_chair_rules_after_observing_the_placards')}
          </p>
        </div>

        <div class="flex items-center justify-center gap-4">
          <Button
            size="lg"
            variant="outline"
            class="min-w-[140px] gap-2 text-base text-red-600 hover:text-red-700"
            onclick={handleReject}
          >
            <X size={18} />
            {t('procedure_reject_2')}
          </Button>
          <Button size="lg" class="min-w-[140px] gap-2 text-base" onclick={handleApprove}>
            <Check size={18} />
            {t('procedure_approve_2')}
          </Button>
        </div>
      </div>
    </div>
  {:else}
    <div class="flex flex-1 items-center justify-center">
      <div class="flex flex-col items-center gap-4 text-muted-foreground">
        <Vote size={48} class="opacity-30" />
        <p class="text-lg font-medium">{t('procedure_no_motion_awaiting_a_vote')}</p>
        <Button variant="outline" size="sm" onclick={goBack}>
          {t('procedure_back_to_meeting')}
        </Button>
      </div>
    </div>
  {/if}
</div>
