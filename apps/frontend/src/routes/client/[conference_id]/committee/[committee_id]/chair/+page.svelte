<script lang="ts">
  import { t, formatNumber } from '$lib/i18n'
  import { page } from '$app/state'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'

  import { VETO_NAME } from '$lib/classes/const'

  import {
    currentCommittee,
    startInitialRollCall,
    resumeMeeting,
    resetRollCall
  } from '$lib/classes/stores/conference/conference-store'
  import {
    getDisplayBridge,
    buildDisplayData
  } from '$lib/classes/clients/conference-display-client'

  import { timerDialogOpen } from '$lib/classes/stores/conference/timer-store'
  import ChairPhaseView from '$lib/components/conference/chair/chair-phase-view.svelte'
  import { getChairPresentation } from '$lib/classes/utils/committee/chair-presentation'
  import {
    calculateQuorum,
    defaultProcedureRules
  } from '$lib/classes/utils/committee/procedure-rules'

  import MotionDialog from '$lib/components/conference/motion/motion-dialog.svelte'
  import PointDialog from '$lib/components/conference/point/point-dialog.svelte'

  import PageTopBar from '$lib/components/conference/common/page-top-bar.svelte'

  import {
    Gavel,
    Play,
    Monitor,
    HelpCircle,
    Timer,
    ScrollText,
    Settings,
    RotateCcw,
    ListChecks
  } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger
  } from '$lib/components/ui/alert-dialog'

  const conferenceId = $derived(page.params.conference_id ?? null)
  const committeeId = $derived(page.params.committee_id ?? null)

  const conf = $derived($currentCommittee)
  const presentation = $derived(conf ? getChairPresentation(conf) : null)
  const agendaMode = $derived(conf?.agendaMode ?? false)
  const agendaStage = $derived(conf?.appealWorkflow?.stage ?? null)
  const chairHostingRequired = $derived(
    !agendaMode || agendaStage === 'evaluation_debate'
  )
  const rules = $derived(
    conf?.procedureRules ?? defaultProcedureRules(conf?.substantiveVotingMajority)
  )
  const quorum = $derived(conf ? calculateQuorum(conf.participantSeats, rules.quorum) : null)
  let motionDialogOpen = $state(false)
  let pointDialogOpen = $state(false)
  let showResetConfirm = $state(false)

  function openRollCall(): void {
    if (!conf) return

    if (conf.phase === 'preamble') startInitialRollCall()

    const route =
      `/client/${conferenceId}/committee/${committeeId}/chair/roll-call` as `/client/${string}/committee/${string}/chair/roll-call`
    goto(resolve(route))
  }

  function resumeAndStartRollCall(): void {
    if (!conf) return
    resumeMeeting()
    openRollCall()
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
          onclick={() =>
            goto(resolve(`/client/${conferenceId}/committee/${committeeId}/chair/settings`))}
        >
          <Settings size={12} />
          {t('procedure_meeting_settings')}
        </Button>

        <AlertDialog bind:open={showResetConfirm}>
          <AlertDialogTrigger>
            {#snippet child({ props })}
              <Button
                {...props}
                size="sm"
                variant="outline"
                class="h-8 gap-1.5 text-xs"
                disabled={!conf || conf.participantSeats.length === 0}
              >
                <RotateCcw size={12} />
                {t('procedure_restart_roll_call')}
              </Button>
            {/snippet}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('procedure_restart_roll_call')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t(
                  'procedure_this_resets_all_participants_to_absent_and_returns_the_meeting_to_roll_call_continue'
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('procedure_cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onclick={() => {
                  resetRollCall()
                  showResetConfirm = false
                  openRollCall()
                }}
              >
                {t('procedure_confirm_restart')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Button
          size="sm"
          variant="outline"
          class="h-8 gap-1.5 text-xs"
          title={t('procedure_meeting_log')}
          href={resolve(`/client/${conferenceId}/committee/${committeeId}/chair/log`)}
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

        {#if presentation.canProposePoint && chairHostingRequired}
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

        {#if presentation.hasPrimaryAction && chairHostingRequired}
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
          <Button
            size="sm"
            variant="outline"
            class="h-8 gap-1.5 text-xs"
            onclick={resumeAndStartRollCall}
          >
            <Play size={12} />
            {t('procedure_resume_and_start_roll_call')}
          </Button>
        {/if}
      {/snippet}
    </PageTopBar>

    {#if chairHostingRequired}
      <ChairPhaseView screen={presentation.screen} onStartRollCall={openRollCall} />
    {:else}
      <div class="flex flex-1 items-center justify-center p-6">
        <div class="max-w-md rounded-2xl border bg-card px-8 py-12 text-center shadow-sm">
          <span
            class="mx-auto flex size-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300"
          >
            <ListChecks size={22} />
          </span>
          <h2 class="mt-4 text-lg font-semibold">{t('procedure_no_hosting_required_title')}</h2>
          <p class="mt-2 text-sm leading-6 text-muted-foreground">
            {t('procedure_no_hosting_required_description')}
          </p>
        </div>
      </div>
    {/if}

    <!-- Motion Dialog -->
    {#key motionDialogOpen}
      <MotionDialog bind:open={motionDialogOpen} />
    {/key}

    <!-- Point Dialog -->
    {#key pointDialogOpen}
      <PointDialog bind:open={pointDialogOpen} />
    {/key}
  {:else}
    <div class="flex flex-1 items-center justify-center text-muted-foreground">
      <p>{t('procedure_select_or_create_a_conference')}</p>
    </div>
  {/if}
</div>
