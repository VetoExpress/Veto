<script lang="ts">
  import { t } from '$lib/i18n'
  import type { ConferenceDisplayData } from '$lib/classes/types/conference'
  import { formatTime } from '$lib/classes/formatters/time-formater'
  import { Coffee, MessageSquare, User } from '@lucide/svelte'
  import SpeakerQueueDisplay from '$lib/components/conference-display/speaker-queue-display.svelte'
  import CurrentSpeakerCard from '$lib/components/conference-display/current-speaker-card.svelte'
  import DisplaySectionHeader from '$lib/components/conference-display/display-section-header.svelte'
  import DisplayPage from '$lib/components/conference-display/display-page.svelte'
  import { DISPLAY_MAX_SPEAKERS } from '$lib/classes/const'

  let { data }: { data: ConferenceDisplayData } = $props()
  const caucusTimer = $derived(data.caucusTimer!)
</script>

<DisplayPage>
  {#if caucusTimer.type === 'moderated' && caucusTimer.caucusSpeakers}
    {@const speakers = caucusTimer.caucusSpeakers}
    {@const currentIdx = caucusTimer.currentSpeakerIndex ?? -1}
    {@const currentSpeaker = currentIdx >= 0 ? speakers[currentIdx] : null}

    <!-- 有主持磋商：逐人发言 -->
    <div class="flex flex-col items-center gap-10">
      {#if currentSpeaker && currentSpeaker.status === 'speaking' && data.currentSpeaker}
        <!-- 当前发言人 -->
        <CurrentSpeakerCard
          seat={data.currentSpeaker.seat}
          remainingSec={data.currentSpeaker.remainingSec ?? 0}
          status={data.currentSpeaker.status}
        />
      {:else}
        <SpeakerQueueDisplay {speakers} max={DISPLAY_MAX_SPEAKERS} title={t('components_moderated_caucus')} />
      {/if}
    </div>
  {:else if caucusTimer.type === 'individual'}
    <!-- 个人演讲：单人独白倒计时 -->
    {@const isPaused = caucusTimer.status === 'paused'}
    <div class="flex flex-col items-center gap-10">
      <DisplaySectionHeader
        Icon={User}
        label={isPaused ? t('components_timer_paused') : t('components_individual_speech')}
        colorClass={isPaused ? 'text-[#C9A84C]/50' : 'text-[#5B92E5]'}
      />

      {#if caucusTimer.topic}
        <div
          class="text-2xl font-medium tracking-[0.05em] {isPaused
            ? 'text-white/30'
            : 'text-white/70'}"
        >
          {caucusTimer.topic}
        </div>
      {/if}

      <div
        class="font-mono text-[120px] font-light tabular-nums leading-none tracking-tight {isPaused
          ? 'text-[#C9A84C]/50'
          : 'text-[#5B92E5]'}"
      >
        {formatTime(Math.max(0, caucusTimer.remainingSec))}
      </div>
    </div>
  {:else}
    <!-- 自由磋商 / 辩论：总倒计时 -->
    {@const isPaused = caucusTimer.status === 'paused'}
    {@const isDebate =
      caucusTimer.type === 'moderated_debate' || caucusTimer.type === 'unmoderated_debate'}
    {@const countdownLabel =
      caucusTimer.type === 'moderated_debate'
        ? t('components_moderated_debate')
        : caucusTimer.type === 'unmoderated_debate'
          ? t('components_unmoderated_debate')
          : t('components_unmoderated_caucus')}
    {@const CountdownIcon = isDebate ? MessageSquare : Coffee}
    <div class="flex flex-col items-center gap-10">
      <DisplaySectionHeader
        Icon={CountdownIcon}
        label={isPaused ? t('components_timer_paused') : countdownLabel}
        colorClass={isPaused ? 'text-[#C9A84C]/50' : 'text-[#C9A84C]'}
      />

      {#if caucusTimer.type === 'moderated_debate' && caucusTimer.topic}
        <div
          class="max-w-5xl text-center text-3xl font-medium tracking-[0.05em] {isPaused
            ? 'text-white/30'
            : 'text-white/70'}"
        >
          {caucusTimer.topic}
        </div>
      {/if}

      <div
        class="font-mono text-[120px] font-light tabular-nums leading-none tracking-tight {isPaused
          ? 'text-[#C9A84C]/50'
          : 'text-[#C9A84C]'}"
      >
        {formatTime(Math.max(0, caucusTimer.remainingSec))}
      </div>
    </div>
  {/if}
</DisplayPage>
