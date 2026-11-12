<script lang="ts">
  import { t, formatNumber } from '$lib/i18n'
  /**
   * motion/index.svelte
   * ──────────────────────
   * 动议阶段内容组件 —— 通过 $props 接收 Shell 传入的数据。
   *
   * 阶段流转：voting（表决中） → result（结果）
   */
  import {
    Presentation,
    MessageSquare,
    Coffee,
    Pencil,
    Gavel,
    Timer,
    LogOut,
    Vote,
    UserRoundCheck
  } from '@lucide/svelte'
  import { MOTION_LABELS } from '$lib/classes/types/conference'
  import type { ConferenceDisplayData } from '$lib/classes/types/conference'
  import type { MotionType } from '$lib/classes/types/conference'
  import AutoFitText from '$lib/components/conference-display/auto-fit-text.svelte'
  import DisplayPage from '$lib/components/conference-display/display-page.svelte'
  import DisplaySectionHeader from '$lib/components/conference-display/display-section-header.svelte'

  let { data }: { data: ConferenceDisplayData } = $props()

  const activeMotion = $derived(data.activeMotion ?? null)

  const motionStage = $derived.by(() => {
    if (!activeMotion) return null
    return activeMotion.status === 'pending' ? 'voting' : 'result'
  })

  const MOTION_ICONS: Record<string, typeof Gavel> = {
    open_speakers_list: Presentation,
    moderated_caucus: MessageSquare,
    unmoderated_caucus: Coffee,
    moderated_debate: MessageSquare,
    unmoderated_debate: MessageSquare,
    modify_speaking_time: Pencil,
    closure_debate: Gavel,
    suspend_meeting: Timer,
    close_meeting: LogOut,
    substantive_vote: Vote,
    change_attendance: UserRoundCheck
  }

  const Icon = $derived(
    activeMotion?.type ? (MOTION_ICONS[activeMotion.type] ?? Presentation) : Presentation
  )

  function getDisplayParts(am: ConferenceDisplayData['activeMotion']): {
    title: string
  } {
    const type = am?.type as MotionType | undefined
    if (!type) return { title: '' }

    switch (type) {
      case 'moderated_caucus':
        return { title: am?.topic ?? '' }
      case 'unmoderated_caucus':
        return { title: t('components_unmoderated_caucus') }
      case 'moderated_debate':
        return { title: am?.topic ?? t('components_moderated_debate') }
      case 'unmoderated_debate':
        return { title: t('components_unmoderated_debate') }
      case 'modify_speaking_time':
        return { title: t('components_modify_speaking_time') }
      case 'suspend_meeting':
        return { title: t('components_suspend_meeting') }
      case 'close_meeting':
        return { title: t('components_close_meeting') }
      case 'closure_debate':
        return { title: t('components_close_debate') }
      case 'open_speakers_list':
        return { title: t('components_open_speakers_list') }
      case 'change_attendance':
        return { title: t('components_change_attendance') }
      case 'substantive_vote':
        return { title: am?.documentName ?? '' }
      default:
        return { title: MOTION_LABELS[type] ?? type }
    }
  }

  const displayTitle = $derived(getDisplayParts(activeMotion ?? undefined).title)
</script>

<DisplayPage>
  {#if motionStage === 'voting' && activeMotion}
    <DisplaySectionHeader {Icon} label={t('components_motion_vote')} colorClass="text-[#5B92E5]" />

    <div class="mt-5 flex flex-col items-center gap-2">
      <AutoFitText
        text={displayTitle}
        class="font-sem ibold tracking-wide text-white text-balance wrap-break-word"
      />
    </div>

    <div class="mt-3 text-3xl tracking-wider text-white/40">
      {t('components_proposed_by', { name: activeMotion.proposedBy?.name ?? '' })}
    </div>

    {#if activeMotion.votingRule}
      {@const rule = activeMotion.votingRule}
      <div class="mt-5 space-y-2 text-center text-xl text-white/50">
        <p>
          {rule.threshold.type === 'fixed'
            ? t('components_threshold_fixed', { count: formatNumber(rule.threshold.value) })
            : t(
                rule.threshold.type === 'simple_majority'
                  ? 'components_simple_majority'
                  : 'components_two_thirds_majority'
              )}
        </p>
        <p>
          {t(
            rule.basis === 'present_participants'
              ? 'components_basis_present_participants'
              : 'components_basis_present_voting_eligible'
          )}
        </p>
        <p>
          {t('components_vote_threshold_summary', {
            denominator: formatNumber(rule.denominator),
            required: formatNumber(rule.required)
          })}
        </p>
        <p>{t('components_manual_motion_decision')}</p>
      </div>
    {/if}

    {#if activeMotion.type === 'moderated_caucus'}
      <div class="mt-15 space-y-2 text-2xl tracking-wider text-white/25">
        {#if activeMotion.totalTimeSec}
          <p>
            {t('components_total_duration', { seconds: activeMotion.totalTimeSec })}
          </p>
        {/if}
        {#if activeMotion.speakingTimePerPersonSec}
          <p>
            {t('components_speaker_duration', { seconds: activeMotion.speakingTimePerPersonSec })}
          </p>
        {/if}
      </div>
    {:else if (activeMotion.type === 'unmoderated_caucus' || activeMotion.type === 'moderated_debate' || activeMotion.type === 'unmoderated_debate') && activeMotion.totalTimeSec}
      <div class="mt-5 text-2xl tracking-wider text-white/25">
        {t('components_duration', { seconds: activeMotion.totalTimeSec })}
      </div>
    {:else if activeMotion.type === 'modify_speaking_time' && activeMotion.newTimeSec != null}
      <div class="mt-5 text-2xl tracking-wider text-white/25">
        {t('components_new_speaking_time', { seconds: activeMotion.newTimeSec })}
      </div>
    {/if}
  {:else if motionStage === 'result' && activeMotion}
    {@const isApproved = activeMotion.status === 'approved'}
    <DisplaySectionHeader
      {Icon}
      label={isApproved ? t('components_vote_approved') : t('components_vote_rejected')}
      colorClass={isApproved ? 'text-emerald-400' : 'text-red-400'}
    />

    <div
      class="mt-5 text-8xl font-bold tracking-wide {isApproved
        ? 'text-emerald-400'
        : 'text-red-400'}"
    >
      {isApproved ? t('components_adopted') : t('components_rejected')}
    </div>

    <div class="mt-4 font-semibold tracking-wide text-white">
      <AutoFitText
        text={displayTitle}
        class="font-semibold tracking-wide text-white text-balance"
      />
    </div>
    <div class="mt-3 text-3xl tracking-wider text-white/40">
      {t('components_proposed_by', { name: activeMotion.proposedBy?.name ?? '' })}
    </div>
  {/if}
</DisplayPage>
