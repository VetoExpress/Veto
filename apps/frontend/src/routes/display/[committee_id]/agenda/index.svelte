<script lang="ts">
  import { t } from '$lib/i18n'
  import { BookOpen, FileCheck2, Handshake, ListChecks, Pause, Clock3 } from '@lucide/svelte'
  import type { ConferenceDisplayData } from '$lib/classes/types/conference'
  import { formatTime } from '$lib/classes/formatters/time-formater'
  import DisplayPage from '$lib/components/conference-display/display-page.svelte'
  import DisplaySectionHeader from '$lib/components/conference-display/display-section-header.svelte'
  import SeatNameDisplay from '$lib/components/conference-display/seat-name-display.svelte'
  import AutoFitText from '$lib/components/conference-display/auto-fit-text.svelte'

  let { data }: { data: ConferenceDisplayData } = $props()

  const workflow = $derived(data.agendaWorkflow!)
  const stage = $derived(workflow.stage)

  const header = $derived.by(() => {
    if (stage === 'agenda') return { label: t('components_agenda_provisional'), Icon: ListChecks }
    if (stage === 'document_reading')
      return { label: t('components_agenda_document_reading'), Icon: BookOpen }
    if (stage === 'consensus_meeting')
      return { label: t('components_agenda_consensus_meeting'), Icon: Handshake }
    if (stage === 'negotiation_decision')
      return { label: t('components_agenda_next_step'), Icon: Clock3 }
    if (stage === 'pcn_finalization')
      return { label: t('components_agenda_pcn_finalization'), Icon: FileCheck2 }
    return { label: t('components_agenda_postponed'), Icon: Clock3 }
  })

  const meetingStatusLabel = $derived(
    t(
      workflow.meetingStatus === 'provisional'
        ? 'components_agenda_status_provisional'
        : workflow.meetingStatus === 'informal'
          ? 'components_agenda_status_informal'
          : 'components_agenda_status_formal'
    )
  )

  const activeMeeting = $derived(workflow.activeConsensusMeeting)
</script>

<DisplayPage>
  <div class="flex w-full max-w-6xl flex-col items-center gap-8">
    <DisplaySectionHeader
      Icon={header.Icon}
      label={header.label}
      colorClass={workflow.meetingStatus === 'informal' ? 'text-[#C9A84C]' : 'text-[#5B92E5]'}
    />

    <div class="flex flex-wrap items-center justify-center gap-3 text-xs uppercase tracking-[0.18em] text-white/30">
      <span>{meetingStatusLabel}</span>
      <span>·</span>
      <span>
        {t('components_agenda_consensus_count', {
          count: workflow.consensusMeetingCount,
          limit: workflow.consensusMeetingLimit
        })}
      </span>
    </div>

    {#if workflow.agendaTitle}
      <AutoFitText
        text={workflow.agendaTitle}
        class="max-w-5xl text-center text-3xl font-semibold tracking-wide text-white text-balance"
      />
    {/if}

    {#if stage === 'agenda'}
      <div class="grid w-full max-w-4xl gap-3">
        {#each workflow.agendaItems as item, index (index)}
          <div
            class="flex items-center gap-4 rounded-sm border border-white/10 bg-white/[0.02] px-5 py-4"
          >
            <span
              class="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/15 text-sm text-white/50"
            >
              {index + 1}
            </span>
            <span class="min-w-0 flex-1 truncate text-lg text-white/70">{item.title}</span>
            <span class="text-xs uppercase tracking-[0.14em] text-white/25">
              {t(
                item.status === 'completed'
                  ? 'components_agenda_item_completed'
                  : item.status === 'current'
                    ? 'components_agenda_item_current'
                    : 'components_agenda_item_pending'
              )}
            </span>
          </div>
        {/each}
      </div>
      <p class="max-w-3xl text-center text-sm leading-6 text-white/35">
        {t('components_agenda_objection_instruction')}
      </p>
      {#if workflow.agendaRevisionRequired}
        <p class="text-center text-sm font-medium tracking-wide text-[#C9A84C]">
          {t('components_agenda_revision_required')}
        </p>
      {/if}
    {:else if stage === 'document_reading'}
      <div class="text-center">
        <p class="text-sm uppercase tracking-[0.16em] text-white/30">
          {t('components_agenda_reading_remaining')}
        </p>
        <p class="mt-4 font-mono text-8xl font-light tabular-nums text-white/80">
          {formatTime(workflow.reading?.remainingSec ?? 10 * 60)}
        </p>
        {#if workflow.documentName}
          <p class="mt-4 text-xl tracking-wide text-white/40">{workflow.documentName}</p>
        {/if}
      </div>
    {:else if stage === 'consensus_meeting' && activeMeeting}
      <div class="grid w-full max-w-5xl gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div class="flex flex-col items-center justify-center rounded-sm border border-white/10 bg-white/[0.02] px-8 py-10">
          <p class="text-xs uppercase tracking-[0.18em] text-white/30">
            {t('components_agenda_consensus_issue')}
          </p>
          <p class="mt-3 text-center text-2xl font-medium leading-9 text-white/70">
            {activeMeeting.issue}
          </p>
          <p class="mt-8 text-xs uppercase tracking-[0.16em] text-white/25">
            {activeMeeting.status === 'awaiting_revision'
              ? t('components_agenda_awaiting_revision')
              : t('components_agenda_consensus_remaining')}
          </p>
          <p class="mt-2 font-mono text-7xl font-light tabular-nums text-white/80">
            {formatTime(activeMeeting.remainingSec)}
          </p>
          {#if activeMeeting.status === 'paused'}
            <p class="mt-4 flex items-center gap-2 text-sm uppercase tracking-[0.14em] text-[#C9A84C]">
              <Pause size={14} />
              {t('components_agenda_consensus_paused')}
            </p>
          {/if}
        </div>

        <div class="flex flex-col gap-3">
          {#if activeMeeting.currentSpeaker}
            <div class="rounded-sm border border-[#5B92E5]/25 bg-[#5B92E5]/[0.06] px-5 py-4">
              <p class="text-xs uppercase tracking-[0.16em] text-white/25">
                {t('components_agenda_speaking_now')}
              </p>
              <SeatNameDisplay
                name={activeMeeting.currentSpeaker.seat.name}
                shortName={activeMeeting.currentSpeaker.seat.shortName ?? ''}
              />
              <p class="mt-2 text-center font-mono text-3xl tabular-nums text-white/60">
                {formatTime(activeMeeting.currentSpeaker.remainingSec)}
              </p>
            </div>
          {/if}
          {#if activeMeeting.speakers.length > 0}
            <div class="grid gap-2">
              {#each activeMeeting.speakers as speaker, index (index)}
                <div class="flex items-center gap-3 rounded-sm border border-white/10 bg-white/[0.02] px-4 py-2.5">
                  <span class="min-w-0 flex-1 truncate text-sm text-white/55">
                    {speaker.seat.name}
                  </span>
                  <span class="text-xs tabular-nums text-white/30">
                    {formatTime(speaker.remainingSec)}
                  </span>
                  <span class="text-[10px] uppercase tracking-[0.12em] text-white/25">
                    {t(
                      speaker.status === 'speaking'
                        ? 'components_agenda_speaker_speaking'
                        : speaker.status === 'finished'
                          ? 'components_agenda_speaker_finished'
                          : 'components_agenda_speaker_waiting'
                    )}
                  </span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {:else if stage === 'negotiation_decision'}
      <div class="flex flex-col items-center gap-4 text-center">
        <Clock3 size={44} class="text-[#5B92E5]" />
        <p class="text-3xl font-light text-white/70">
          {t('components_agenda_next_step_description')}
        </p>
      </div>
    {:else if stage === 'pcn_finalization'}
      <div class="flex flex-col items-center gap-4 text-center">
        <FileCheck2 size={44} class="text-[#5B92E5]" />
        <p class="text-3xl font-light text-white/70">
          {workflow.documentName ?? t('components_agenda_pcn_untitled')}
        </p>
        <p class="text-sm uppercase tracking-[0.16em] text-white/30">
          {t('components_agenda_pcn_ready')}
        </p>
      </div>
    {:else if stage === 'postponed'}
      <div class="flex flex-col items-center gap-4 text-center">
        <Clock3 size={44} class="text-[#C9A84C]" />
        <p class="text-3xl font-light text-white/70">
          {t('components_agenda_postponed')}
        </p>
        <p class="max-w-xl text-sm leading-6 text-white/30">
          {t('components_agenda_postponed_description')}
        </p>
      </div>
    {/if}
  </div>
</DisplayPage>
