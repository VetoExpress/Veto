<script lang="ts">
  import { page } from '$app/state'
  import { resolve } from '$app/paths'
  import { RotateCcw, Square, Workflow } from '@lucide/svelte'
  import PageTopBar from '$lib/components/conference/common/page-top-bar.svelte'
  import AppealWorkflowView from '$lib/components/conference/appeal/appeal-workflow-view.svelte'
  import { Badge } from '$lib/components/ui/badge'
  import { Button } from '$lib/components/ui/button'
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
  import {
    currentCommittee,
    finishAppealConsensusMeeting,
    restartAppealWorkflow
  } from '$lib/classes/stores/conference/conference-store'
  import { t } from '$lib/i18n'

  const conferenceId = $derived(page.params.conference_id ?? null)
  const committeeId = $derived(page.params.committee_id ?? null)
  const conf = $derived($currentCommittee)
  const workflow = $derived(conf?.appealWorkflow)
  const completedAgendaCount = $derived(
    new Set(workflow?.completedAgendaItemIds ?? []).size
  )
  const totalAgendaCount = $derived(conf?.agenda.length ?? 0)
  const consensusMeetingActive = $derived(
    workflow?.stage === 'consensus_meeting' &&
      workflow.activeConsensusMeeting?.status === 'active'
  )
  let restartConfirmOpen = $state(false)

  function restartWorkflow(): void {
    restartAppealWorkflow()
    restartConfirmOpen = false
  }
</script>

<svelte:head>
  <title>{t('procedure_appeal_workflow')}</title>
</svelte:head>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
  <PageTopBar
    icon={Workflow}
    title={t('procedure_appeal_workflow')}
    subtitle={conf?.name}
    backHref={resolve(`/client/${conferenceId}/committee/${committeeId}/chair`)}
    backLabel={t('procedure_back_to_chair_workspace')}
  >
    {#snippet actions()}
      <Badge variant="outline" class="h-8 gap-1.5 px-3 text-xs font-normal">
        {t('procedure_appeal_progress')}
        <span class="font-semibold tabular-nums">
          {completedAgendaCount} / {totalAgendaCount}
        </span>
      </Badge>
      {#if consensusMeetingActive}
        <Button
          variant="destructive"
          size="sm"
          class="h-8 gap-1.5 text-xs"
          onclick={() => finishAppealConsensusMeeting()}
        >
          <Square size={12} />
          {t('procedure_appeal_consensus_end_meeting')}
        </Button>
      {/if}
      <AlertDialog bind:open={restartConfirmOpen}>
        <AlertDialogTrigger>
          {#snippet child({ props })}
            <Button {...props} variant="outline" size="sm" class="h-8 gap-1.5 text-xs">
              <RotateCcw size={12} />
              {t('procedure_appeal_restart_workflow')}
            </Button>
          {/snippet}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('procedure_appeal_restart_workflow')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('procedure_appeal_restart_workflow_confirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('procedure_cancel')}</AlertDialogCancel>
            <AlertDialogAction onclick={restartWorkflow}>
              {t('procedure_appeal_restart')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    {/snippet}
  </PageTopBar>
  {#if conf?.agendaMode}
    <AppealWorkflowView />
  {:else}
    <div class="flex flex-1 items-center justify-center p-6">
      <p class="text-sm text-muted-foreground">{t('procedure_agenda_mode_disabled')}</p>
    </div>
  {/if}
</div>
