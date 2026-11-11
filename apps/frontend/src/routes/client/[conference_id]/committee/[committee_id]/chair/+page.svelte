<script lang="ts">
  import { t } from '$lib/i18n'
  import { page } from '$app/state'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'

  import { VETO_NAME } from '$lib/classes/const'

  import {
    currentCommittee,
    setPhase,
    resumeMeeting
  } from '$lib/classes/stores/conference/conference-store'
  import {
    getDisplayBridge,
    buildDisplayData
  } from '$lib/classes/clients/conference-display-client'

  import { timerDialogOpen } from '$lib/classes/stores/conference/timer-store'
  import { activeSettingsSection, settingsDialogOpen } from '$lib/classes/stores/app/global-ui-store'

  import ChairPhaseView from '$lib/components/conference/chair/chair-phase-view.svelte'
  import { getChairPresentation } from '$lib/classes/utils/committee/chair-presentation'

  import MotionDialog from '$lib/components/conference/motion/motion-dialog.svelte'
  import PointDialog from '$lib/components/conference/point/point-dialog.svelte'
  import ConferenceLogDialog from '$lib/components/conference/conference-log-dialog.svelte'

  import PageTopBar from '$lib/components/conference/common/page-top-bar.svelte'

  import { Gavel, Play, Monitor, HelpCircle, Timer, ScrollText, Settings } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'

  const conferenceId = $derived(page.params.conference_id ?? null)
  const committeeId = $derived(page.params.committee_id ?? null)

  const conf = $derived($currentCommittee)
  const presentation = $derived(conf ? getChairPresentation(conf) : null)
  let motionDialogOpen = $state(false)
  let pointDialogOpen = $state(false)
  let logDialogOpen = $state(false)

  function startRollCall(): void {
    if (!conf) return

    setPhase('roll_call')

    const route =
      `/client/${conferenceId}/committee/${committeeId}/chair/roll-call` as `/client/${string}/committee/${string}/chair/roll-call`
    goto(resolve(route))
  }

  function handlePrimaryAction(): void {
    if (presentation?.hasPrimaryAction) motionDialogOpen = true
  }
</script>

<svelte:head>
  <title>{VETO_NAME}</title>
</svelte:head>

<div class="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
  {#if conf && presentation}
    <PageTopBar
      icon={Gavel}
      title={presentation.title}
      subtitle={conf.name}
      backHref={resolve(`/client/${conferenceId}/committee/${committeeId}`)}
      showBackButton={false}
    >
      {#snippet actions()}
        <Button
          size="sm"
          variant="outline"
          class="h-8 gap-1.5 text-xs"
          title={t('procedure_meeting_settings')}
          onclick={() => {
            activeSettingsSection.set('committee')
            settingsDialogOpen.set(true)
          }}
        >
          <Settings size={12} />
          {t('procedure_meeting_settings')}
        </Button>

        <Button
          size="sm"
          variant="outline"
          class="h-8 gap-1.5 text-xs"
          title={t('procedure_meeting_log')}
          onclick={() => (logDialogOpen = true)}
        >
          <ScrollText size={12} />
          {t('procedure_log')}
        </Button>

        <Button
          size="sm"
          variant="outline"
          class="h-8 gap-1.5 text-xs"
          title={t('procedure_open_standalone_timer')}
          onclick={() => {
            timerDialogOpen.set(true)
          }}
        >
          <Timer size={12} />
          {t('procedure_timer')}
        </Button>

        {#if presentation.canProposePoint}
          <Button
            size="sm"
            variant="outline"
            class="h-8 gap-1.5 text-xs"
            title={t('procedure_raise_a_point')}
            onclick={() => (pointDialogOpen = true)}
          >
            <HelpCircle size={12} />
            {t('procedure_point')}
          </Button>
        {/if}

        {#if presentation.hasPrimaryAction}
          <Button
            size="sm"
            class="h-8 gap-1.5 text-xs"
            onclick={handlePrimaryAction}
            disabled={!presentation.canProposeMotion}
            title={presentation.motionDisabledReason}
          >
            <Play size={12} />
            {t('procedure_motions_and_procedure')}
          </Button>
        {/if}

        {#if presentation.canResumeMeeting}
          <Button size="sm" variant="outline" class="h-8 gap-1.5 text-xs" onclick={resumeMeeting}>
            <Play size={12} />
            {t('procedure_resume_meeting')}
          </Button>
        {/if}
      {/snippet}
    </PageTopBar>

    <ChairPhaseView screen={presentation.screen} onStartRollCall={startRollCall} />

    <!-- Motion Dialog -->
    {#key motionDialogOpen}
      <MotionDialog bind:open={motionDialogOpen} />
    {/key}

    <!-- Point Dialog -->
    {#key pointDialogOpen}
      <PointDialog bind:open={pointDialogOpen} />
    {/key}

    <!-- Log Dialog -->
    <ConferenceLogDialog bind:open={logDialogOpen} minutes={conf?.minutes ?? []} />
  {:else}
    <div class="flex flex-1 items-center justify-center text-muted-foreground">
      <p>{t('procedure_select_or_create_a_conference')}</p>
    </div>
  {/if}
</div>
