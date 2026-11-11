<script lang="ts">
  import { t } from '$lib/i18n'
  /**
   * caucus-setup/index.svelte
   * ─────────────────────────
   * 磋商发言名单设置阶段 —— Display 组件。
   */
  import type { ConferenceDisplayData } from '$lib/classes/types/conference'
  import SpeakerQueueDisplay from '$lib/components/conference-display/speaker-queue-display.svelte'
  import AutoFitText from '$lib/components/conference-display/auto-fit-text.svelte'
  import DisplaySectionHeader from '$lib/components/conference-display/display-section-header.svelte'
  import DisplayPage from '$lib/components/conference-display/display-page.svelte'
  import { DISPLAY_MAX_SPEAKERS } from '$lib/classes/const'
  import { Users } from '@lucide/svelte'

  let { data }: { data: ConferenceDisplayData } = $props()

  const setup = $derived(data.caucusSetup ?? null)
</script>

<DisplayPage>
  {#if setup}
    <div class="flex flex-col items-center gap-10">
      <!-- Topic 大字 -->
      {#if setup.topic}
        <AutoFitText text={setup.topic} class="font-semibold tracking-wide text-white" />
      {/if}

      <DisplaySectionHeader Icon={Users} label={t('components_caucus_setup')} colorClass="text-[#5B92E5]" />

      <!-- 动议国 -->
      <div class="text-2xl tracking-wider text-white/25">
        {t('components_proposer_label')}
        <span class="text-white/50">{setup.proposerName}</span>
        <span class="mx-2 text-white/10">|</span>
        <span class="text-white/30">
          {setup.proposerPosition === 'first' ? t('components_proposer_first') : t('components_proposer_last')}
        </span>
      </div>

      <!-- 发言名单 -->
      <SpeakerQueueDisplay
        speakers={setup.speakerNames.map((d) => ({ seat: d }))}
        max={DISPLAY_MAX_SPEAKERS}
        onlyList={true}
        emptyText={t('components_wait_add_seats')}
      />
    </div>
  {/if}
</DisplayPage>
