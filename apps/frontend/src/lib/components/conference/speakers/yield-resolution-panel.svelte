<script lang="ts">
  import { t } from '$lib/i18n'
  /**
   * yield-resolution-panel.svelte
   * ──────────────────────────────
   * 让渡解析面板 —— 发言人做出让渡选择后，主席在此面板中解析让渡流程。
   *
   * 支持三种让渡类型：
   * - delegate: 选择目标席位
   * - question: 选择提问方 → 原发言人回答（呼吁环节由主席口头执行）
   * - comment: 选择评论方 → 评论方发言（呼吁环节由主席口头执行）
   */
  import { Users, HelpCircle, MessageCircle, X, SkipForward } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Separator } from '$lib/components/ui/separator/index.js'
  import SeatSelector from '$lib/components/conference/common/seat-selector.svelte'
  import type { ParticipantSeat } from '$lib/classes/types/conference'
  import { isParticipantSeat } from '$lib/classes/types/delegate'
  import { formatTime } from '$lib/classes/formatters/time-formater'
  import {
    resolveYieldToChair,
    resolveYieldToDelegate,
    resolveYieldToQuestion,
    resolveYieldToComment
  } from '$lib/classes/stores/conference/conference-store'
  import type { Committee, YieldPendingState } from '$lib/classes/types/conference'

  interface Props {
    conference: Committee
    yieldPending: YieldPendingState
  }

  let { conference, yieldPending }: Props = $props()

  const yp = $derived(yieldPending)
  const remainingFormatted = $derived(formatTime(Math.round(yp.remainingSec)))
  const participantSeats = $derived(conference.seats.filter(isParticipantSeat))
  const originalSeat = $derived(conference.seats.find((seat) => seat.id === yp.originalSeatId))
  const questionerSeat = $derived(
    conference.seats.find((seat) => seat.id === yp.questionerSeatId)
  )

  // 排除原发言人（不能将时间让渡给自己）
  const excludeOriginalId = $derived([yp.originalSeatId])

  function handleSelectDelegate(d: ParticipantSeat): void {
    resolveYieldToDelegate(d.id)
  }

  function handleSelectQuestioner(d: ParticipantSeat): void {
    resolveYieldToQuestion(d.id)
  }

  function handleSelectCommenter(d: ParticipantSeat): void {
    resolveYieldToComment(d.id)
  }

  function handleNoResponse(): void {
    // 无人举手 → 让渡给主席
    resolveYieldToChair()
  }

  const yieldLabel = $derived.by(() => {
    switch (yp.yieldType) {
      case 'delegate':
        return t('procedure_yield_to_delegate')
      case 'question':
        return t('procedure_yield_to_questions')
      case 'comment':
        return t('procedure_yield_to_comments')
    }
  })

  const hasQuestioner = $derived(yp.questionerSeatId != null)
</script>

<div
  class="rounded-lg border-2 border-indigo-300 bg-indigo-50 p-5 dark:border-indigo-700 dark:bg-indigo-950/30"
>
  <!-- 标题栏 -->
  <div class="mb-3 flex items-center gap-2">
    {#if yp.yieldType === 'delegate'}
      <Users size={18} class="text-indigo-500" />
    {:else if yp.yieldType === 'question'}
      <HelpCircle size={18} class="text-indigo-500" />
    {:else}
      <MessageCircle size={18} class="text-indigo-500" />
    {/if}
    <span class="text-sm font-semibold text-foreground">{yieldLabel}</span>
    <span class="ml-auto text-xs text-muted-foreground">{t('procedure_yield_remaining', { value1: remainingFormatted })}</span>
  </div>

  <p class="mb-4 text-sm text-muted-foreground">
    {t('procedure_yield_time_description', { name: originalSeat?.name ?? t('procedure_unknown_seat'), remaining: remainingFormatted, type: yieldLabel ?? '' })}
  </p>

  <Separator class="mb-4" />

  <!-- ═══ 让渡给代表：选择目标席位 ═══ -->
  {#if yp.yieldType === 'delegate' && !hasQuestioner}
    <div class="space-y-3">
      <p class="text-xs text-muted-foreground">{t('procedure_choose_the_seat_receiving_the_remaining_time_no_further_yielding')}</p>
      <SeatSelector
        seats={participantSeats}
        placeholder={t('procedure_search_target_seats')}
        onselect={handleSelectDelegate}
        resetOnSelect={true}
        excludeIds={excludeOriginalId}
      />
      <div class="flex gap-2">
        <Button
          size="sm"
          variant="ghost"
          class="h-8 text-xs text-muted-foreground"
          onclick={handleNoResponse}
        >
          <SkipForward size={12} class="mr-1" />
          {t('procedure_yield_to_chair_instead')}
        </Button>
      </div>
    </div>

    <!-- ═══ 让渡给提问 ═══ -->
  {:else if yp.yieldType === 'question' && !hasQuestioner}
    <div class="space-y-3">
      <p class="text-xs text-muted-foreground">
        {t('procedure_after_inviting_questions_verbally_choose_a_seat_with_a_raised_hand_questions_do_not_us')}
      </p>
      <SeatSelector
        seats={participantSeats}
        placeholder={t('procedure_search_questioning_seats')}
        onselect={handleSelectQuestioner}
        resetOnSelect={true}
        excludeIds={excludeOriginalId}
      />
      <Button size="sm" variant="outline" class="h-8 text-xs" onclick={handleNoResponse}>
        <X size={12} class="mr-1" />
        {t('procedure_no_questions_yield_to_chair')}
      </Button>
    </div>

    <!-- ═══ 让渡给评论 ═══ -->
  {:else if yp.yieldType === 'comment' && !hasQuestioner}
    <div class="space-y-3">
      <p class="text-xs text-muted-foreground">{t('procedure_after_inviting_comments_verbally_choose_a_seat_with_a_raised_hand')}</p>
      <SeatSelector
        seats={participantSeats}
        placeholder={t('procedure_search_commenting_seats')}
        onselect={handleSelectCommenter}
        resetOnSelect={true}
        excludeIds={excludeOriginalId}
      />
      <Button size="sm" variant="outline" class="h-8 text-xs" onclick={handleNoResponse}>
        <X size={12} class="mr-1" />
        {t('procedure_no_comments_yield_to_chair')}
      </Button>
    </div>

    <!-- ═══ 提问已指定：回答阶段 ═══ -->
  {:else if yp.yieldType === 'question' && hasQuestioner}
    <div class="space-y-3 text-center">
      <div class="rounded-md bg-indigo-100 px-4 py-3 dark:bg-indigo-900/30">
        <p class="text-sm font-medium text-indigo-700 dark:text-indigo-400">
          {t('procedure_questioner_speaking', { value1: questionerSeat?.name ?? t('procedure_unknown_seat') })}
        </p>
        <p class="mt-1 text-xs text-muted-foreground">
          {t('procedure_yield_question_explanation', { value1: originalSeat?.name ?? t('procedure_the_original_speaker'), value2: remainingFormatted })}
        </p>
      </div>
      <p class="text-xs text-muted-foreground">
        {t('procedure_the_questioner_is_selected_resume_the_timer_for_the_speaker_to_answer_further_yielding')}
      </p>
    </div>
  {/if}
</div>
