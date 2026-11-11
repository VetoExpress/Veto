<script lang="ts">
  import { t } from '$lib/i18n'
  /**
   * general-debate/index.svelte
   * ────────────────────────────
   * Display 窗口 —— 一般性辩论阶段内容组件。
   *
   * 四个子视图：
   * - yieldPending：让渡处理中状态
   * - currentSpeaker：正在发言（席位名 + 倒计时 + 暂停状态）
   * - readySpeaker：预发言（即将发言 + 等待开始计时）
   * - 主发言名单：下一个发言 + 后续队列
   */
  import { HelpCircle, Volume2, ArrowRight } from '@lucide/svelte'
  import { formatTime } from '$lib/classes/formatters/time-formater'
  import type { ConferenceDisplayData } from '$lib/classes/types/conference'
  import SpeakerQueueDisplay from '$lib/components/conference-display/speaker-queue-display.svelte'
  import CurrentSpeakerCard from '$lib/components/conference-display/current-speaker-card.svelte'
  import DisplaySectionHeader from '$lib/components/conference-display/display-section-header.svelte'
  import { DISPLAY_MAX_SPEAKERS } from '$lib/classes/const'
  import SeatNameDisplay from '$lib/components/conference-display/seat-name-display.svelte'
  import DisplayPage from '$lib/components/conference-display/display-page.svelte'

  let { data }: { data: ConferenceDisplayData } = $props()

  $effect(() => {
    console.log('[general-debate] data:', data)
  })

  const yp = $derived(data.yieldPending as NonNullable<ConferenceDisplayData['yieldPending']>)
  const isYieldCalling = $derived(
    yp != null &&
      (yp.yieldType === 'question' || yp.yieldType === 'comment') &&
      !yp.questionerSeat
  )
  const isYieldQuestioning = $derived(
    yp?.yieldType === 'question' && yp.questionerSeat != null
  )
  const isYieldDelegate = $derived(yp?.yieldType === 'delegate')
</script>

<DisplayPage>
  <!-- ═══ 让渡处理中状态 ═══ -->
{#if isYieldCalling}
  <!-- 主席呼吁场下提问/评论 -->
  <div class="flex flex-col items-center gap-10">
    <DisplaySectionHeader
      Icon={Volume2}
      label={yp.yieldType === 'question' ? t('components_call_questions') : t('components_call_comments')}
      colorClass="text-[#C9A84C]"
    />

    <div class="text-center">
      <div class="text-6xl font-light tracking-wide text-white/70">
        {yp.yieldType === 'question' ? t('components_any_questions') : t('components_any_comments')}
      </div>
      <div class="mt-4 text-2xl font-light tracking-[0.06em] text-white/30">
        {t('components_yield_floor', { name: yp.originalSeat.name, time: formatTime(Math.round(yp.remainingSec)), kind: yp.yieldType })}
      </div>
    </div>
  </div>
{:else if isYieldQuestioning}
  <!-- 提问方已指定，等待/正在进行提问 -->
  <div class="flex flex-col items-center gap-10">
    <DisplaySectionHeader Icon={HelpCircle} label={t('components_question_period')} colorClass="text-[#5B92E5]" />

    <div class="text-center">
      <SeatNameDisplay
        name={yp.questionerSeat?.name ?? ''}
        shortName={yp.questionerSeat?.shortName ?? ''}
      />
      <div class="mt-2 text-3xl font-light tracking-[0.06em] text-white/30">{t('components_asking_question')}</div>
      <div class="mt-6 text-xl tracking-wider text-white/20">
        {t('components_yield_answer', { name: yp.originalSeat.name, time: formatTime(Math.round(yp.remainingSec)) })}
      </div>
    </div>
  </div>
{:else if isYieldDelegate}
  <!-- 让渡给代表：等待主席选择 -->
  <div class="flex flex-col items-center gap-10">
    <DisplaySectionHeader Icon={ArrowRight} label={t('components_yield_time')} colorClass="text-[#C9A84C]" />

    <div class="text-center">
      <div class="text-5xl font-light tracking-wide text-white/70">
        {t('components_yield_delegate', { name: yp.originalSeat.name, time: formatTime(Math.round(yp.remainingSec)) })}
      </div>
      <div class="mt-4 text-2xl tracking-wider text-white/20">{t('components_wait_target_seat')}</div>
    </div>
  </div>
{:else if data.currentSpeaker}
  <CurrentSpeakerCard
    seat={data.currentSpeaker.seat}
    remainingSec={data.currentSpeaker.remainingSec ?? 0}
    status={data.currentSpeaker.status}
  />
{:else}
  {@const waiting = data.speakersList.filter((s: { status: string }) => s.status === 'waiting')}
  {@const allSpeakers = data.readySpeaker ? [data.readySpeaker, ...waiting] : waiting}
  {@const displayTitle = data.readySpeaker ? t('components_up_next') : t('components_speakers_list')}
  {@const displaySubtitle = data.readySpeaker ? t('components_wait_start_timer') : ''}
  <SpeakerQueueDisplay
    speakers={allSpeakers}
    max={DISPLAY_MAX_SPEAKERS}
    title={displayTitle}
    subtitle={displaySubtitle}
  />
    {/if}
</DisplayPage>
