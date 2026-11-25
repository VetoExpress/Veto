<script lang="ts">
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import {
    ArrowDown,
    ArrowRight,
    ArrowUp,
    BookOpen,
    Check,
    Clock3,
    FileCheck2,
    Handshake,
    ListChecks,
    MessageSquare,
    Pencil,
    Plus,
    Users,
    Workflow
  } from '@lucide/svelte'
  import type { LucideIcon } from '@lucide/svelte'
  import { Badge } from '$lib/components/ui/badge'
  import { Button } from '$lib/components/ui/button'
  import * as Card from '$lib/components/ui/card'
  import { Input } from '$lib/components/ui/input'
  import { currentCommittee, syncCurrentCommittee } from '$lib/classes/stores/conference/conference-store'
  import { formatTime } from '$lib/classes/formatters/time-formater'
  import type { AppealWorkflowStage } from '$lib/classes/types/appeal'
  import {
    nextAppealAgendaItemId
  } from '$lib/classes/utils/committee/appeal'
  import { cn } from '$lib/classes/utils'
  import { t, type MessageKey } from '$lib/i18n'

  const steps: { stage: AppealWorkflowStage; label: MessageKey; icon: LucideIcon }[] = [
    { stage: 'roll_call', label: 'procedure_appeal_step_roll_call', icon: Users },
    { stage: 'agenda', label: 'procedure_appeal_step_agenda', icon: ListChecks },
    { stage: 'evaluation_debate', label: 'procedure_appeal_step_evaluation', icon: MessageSquare },
    { stage: 'document_reading', label: 'procedure_appeal_step_reading', icon: BookOpen },
    { stage: 'negotiation_decision', label: 'procedure_appeal_step_negotiation', icon: Workflow },
    { stage: 'consensus_meeting', label: 'procedure_appeal_step_consensus', icon: Handshake },
    { stage: 'pcn_finalization', label: 'procedure_appeal_step_finalization', icon: FileCheck2 }
  ]

  const conferenceId = $derived(page.params.conference_id ?? null)
  const committeeId = $derived(page.params.committee_id ?? null)
  const conf = $derived($currentCommittee)
  const workflow = $derived(conf?.appealWorkflow)
  const orderedAgenda = $derived(
    [...(conf?.agenda ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
  )
  const currentAgendaItem = $derived(
    orderedAgenda.find((item) => item.id === workflow?.currentAgendaItemId) ?? null
  )
  const currentPcn = $derived(conf?.currentAppealPcn ?? null)
  const pcnDisplayName = $derived(
    currentPcn?.fileName || t('procedure_appeal_pcn_file_name_missing')
  )
  const nextAgendaItemId = $derived(
    workflow ? nextAppealAgendaItemId(workflow, orderedAgenda.map((item) => item.id)) : null
  )
  const nextAgendaItem = $derived(
    orderedAgenda.find((item) => item.id === nextAgendaItemId) ?? null
  )

  let pcnFileName = $state('')
  let newAgendaTitle = $state('')
  let editingAgenda = $state(false)
  let formError = $state('')
  let now = $state(Date.now())
  let scrollContainer = $state<HTMLDivElement | null>(null)

  $effect(() => {
    pcnFileName = currentPcn?.fileName ?? ''
  })

  $effect(() => {
    if (workflow?.stage !== 'agenda') editingAgenda = false
  })

  $effect(() => {
    const stage = workflow?.stage
    if (!stage) return
    formError = ''
    scrollContainer?.scrollTo({ top: 0, behavior: 'smooth' })
  })

  $effect(() => {
    if (!conf || workflow?.stage !== 'roll_call') return
    if (conf.phase === 'preamble' || conf.phase === 'roll_call') return
    conf.confirmAppealRollCall()
    syncCurrentCommittee()
  })

  $effect(() => {
    const stage = workflow?.stage
    const activeReading =
      stage === 'document_reading'
        ? workflow?.reading
        : stage === 'consensus_meeting'
          ? workflow?.consensusReading
          : null
    if (!activeReading || activeReading.completedAt) {
      return
    }
    now = Date.now()
    const timer = window.setInterval(() => {
      now = Date.now()
    }, 1000)
    return () => window.clearInterval(timer)
  })

  const readingRemainingSec = $derived.by(() => {
    const reading = workflow?.reading
    if (!reading) return 10 * 60
    if (reading.completedAt) return 0
    return Math.max(
      0,
      Math.ceil((reading.startedAt + reading.durationSec * 1000 - now) / 1000)
    )
  })
  const consensusRemainingSec = $derived.by(() => {
    const reading = workflow?.consensusReading
    if (!reading) return 10 * 60
    if (reading.completedAt) return 0
    return Math.max(
      0,
      Math.ceil((reading.startedAt + reading.durationSec * 1000 - now) / 1000)
    )
  })

  function activeStepIndex(stage: AppealWorkflowStage | undefined): number {
    if (!stage) return 0
    if (stage === 'item_complete') return steps.length
    return Math.max(
      0,
      steps.findIndex((step) => step.stage === stage)
    )
  }

  function stepState(index: number): 'complete' | 'active' | 'upcoming' | 'skipped' {
    if (!workflow) return 'upcoming'
    if (
      index === 5 &&
      workflow.stage === 'pcn_finalization' &&
      workflow.negotiation?.needed === false
    ) {
      return 'skipped'
    }
    const active = activeStepIndex(workflow.stage)
    if (index < active) return 'complete'
    if (index === active) return 'active'
    return 'upcoming'
  }

  function apply(action: () => unknown): boolean {
    const result = action()
    syncCurrentCommittee()
    return result !== false
  }

  function openRollCall(): void {
    if (!conferenceId || !committeeId) return
    const route =
      `/client/${conferenceId}/committee/${committeeId}/chair/roll-call` as `/client/${string}/committee/${string}/chair/roll-call`
    goto(resolve(route))
  }

  function acceptAgenda(): void {
    formError = ''
    if (!orderedAgenda.length) {
      formError = t('procedure_appeal_add_an_item_first')
      return
    }
    apply(() => conf?.acceptAppealAgenda())
  }

  function addAgendaItem(): void {
    if (!conf || !newAgendaTitle.trim()) return
    apply(() => conf.addAgendaItem(newAgendaTitle))
    newAgendaTitle = ''
    formError = ''
  }

  function updateAgendaTitle(itemId: string, value: string): void {
    if (!conf || !value.trim()) return
    apply(() => conf.updateAgendaItemTitle(itemId, value))
  }

  function moveAgendaItem(itemId: string, direction: -1 | 1): void {
    apply(() => conf?.moveAgendaItem(itemId, direction))
  }

  function openChair(): void {
    if (!conferenceId || !committeeId) return
    goto(resolve(`/client/${conferenceId}/committee/${committeeId}/chair`))
  }

  function persistPcnFileName(): boolean {
    if (!conf || !pcnFileName.trim()) return false
    const saved = conf.setAppealPcnFileName(pcnFileName)
    syncCurrentCommittee()
    return saved
  }

  function startReading(): void {
    if (!persistPcnFileName()) return
    apply(() => conf?.startAppealReading())
  }

  function finishReading(): void {
    if (!persistPcnFileName()) return
    apply(() => conf?.finishAppealReading())
  }

  function decideNegotiation(needed: boolean): void {
    apply(() => conf?.decideAppealNegotiation(needed))
  }

  function startConsensusReading(): void {
    apply(() => conf?.startAppealConsensusReading())
  }

  function finishConsensusReading(): void {
    apply(() => conf?.finishAppealConsensusReading())
  }

  function finalizePcn(): void {
    apply(() => conf?.finalizeAppealPcn())
  }

  function moveToNextItem(): void {
    apply(() => conf?.moveToNextAppealAgendaItem())
  }

</script>

{#if conf && workflow}
  <div bind:this={scrollContainer} class="min-h-0 flex-1 overflow-y-auto bg-muted/20">
    <div class="mx-auto flex w-full max-w-[1500px] flex-col gap-6 p-6">
      <section
        class="overflow-hidden rounded-2xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-background to-amber-50 p-6 shadow-sm dark:border-sky-900/60 dark:from-sky-950/40 dark:to-amber-950/20"
      >
        <div class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div class="max-w-2xl">
            <h1 class="text-2xl font-semibold tracking-tight text-foreground">
              {t('procedure_appeal_title')}
            </h1>
            <p class="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              {t('procedure_appeal_description')}
            </p>
          </div>

          <div
            class="min-w-64 rounded-xl border border-border/70 bg-background/80 p-4 shadow-sm backdrop-blur"
          >
            <p class="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {t('procedure_appeal_current_item')}
            </p>
            <p class="mt-1.5 line-clamp-2 text-sm font-semibold text-foreground">
              {currentAgendaItem?.title ?? t('procedure_appeal_no_current_item')}
            </p>
          </div>
        </div>
      </section>

      <section class="overflow-x-auto pb-1">
        <div class="grid min-w-[840px] grid-cols-7 gap-2">
          {#each steps as step, index (step.stage)}
            {@const state = stepState(index)}
            <div
              class={cn(
                'flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors',
                state === 'active' &&
                  'border-foreground/25 bg-muted/60 text-foreground shadow-sm',
                state === 'complete' &&
                  'border-border bg-muted/30 text-muted-foreground',
                state === 'upcoming' && 'border-border/70 bg-background text-muted-foreground',
                state === 'skipped' &&
                  'border-dashed border-border bg-muted/40 text-muted-foreground'
              )}
            >
              <span
                class={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full border',
                  state === 'active' && 'border-foreground/30 bg-background text-foreground',
                  state === 'complete' && 'border-border bg-background text-foreground',
                  state === 'upcoming' && 'border-border bg-muted/40',
                  state === 'skipped' && 'border-dashed border-border bg-background'
                )}
              >
                {#if state === 'complete'}
                  <Check size={13} />
                {:else}
                  <step.icon size={13} />
                {/if}
              </span>
              <div class="min-w-0">
                <p class="truncate text-xs font-medium">{t(step.label)}</p>
                {#if state === 'skipped'}
                  <p class="text-[10px] opacity-70">{t('procedure_appeal_skipped')}</p>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </section>

      <div class="min-w-0">
        <main class="min-w-0">
          <Card.Root class="gap-0 overflow-hidden pt-0 pb-6">
            {#if workflow.stage === 'roll_call'}
              <div class="border-b px-6 py-4">
                <div>
                  <h2 class="text-base font-semibold">{t('procedure_appeal_roll_call_title')}</h2>
                  <p class="text-xs text-muted-foreground">
                    {t('procedure_appeal_roll_call_description')}
                  </p>
                </div>
              </div>
              <Card.Content class="space-y-5 pt-6">
                <div class="grid gap-3 sm:grid-cols-2">
                  <div class="rounded-xl border bg-muted/30 p-4">
                    <p class="text-xs text-muted-foreground">
                      {t('procedure_appeal_present_seats')}
                    </p>
                    <p class="mt-1 text-2xl font-semibold tabular-nums">
                      {conf.getPresentCount()}
                      <span class="text-sm font-normal text-muted-foreground">
                        / {conf.participantSeats.length}
                      </span>
                    </p>
                  </div>
                  <div class="rounded-xl border bg-muted/30 p-4">
                    <p class="text-xs text-muted-foreground">
                      {t('procedure_appeal_voting_seats')}
                    </p>
                    <p class="mt-1 text-2xl font-semibold tabular-nums">
                      {conf.getVotingCount()}
                    </p>
                  </div>
                </div>
                <p class="text-sm leading-6 text-muted-foreground">
                  {t('procedure_appeal_roll_call_hint')}
                </p>
                <div class="flex flex-wrap gap-2">
                  <Button class="gap-2" onclick={openRollCall}>
                    <Users size={16} />
                    {t('procedure_appeal_open_roll_call')}
                  </Button>
                </div>
              </Card.Content>
            {:else if workflow.stage === 'agenda'}
              <div class="border-b px-6 py-4">
                <div>
                  <h2 class="text-base font-semibold">
                    {t('procedure_appeal_provisional_agenda')}
                  </h2>
                  <p class="text-xs text-muted-foreground">
                    {t('procedure_appeal_agenda_description')}
                  </p>
                </div>
              </div>
              <Card.Content class="space-y-5 pt-6">
                {#if orderedAgenda.length === 0}
                  <div class="rounded-xl border border-dashed p-8 text-center">
                    <ListChecks size={28} class="mx-auto text-muted-foreground/40" />
                    <p class="mt-3 text-sm font-medium">{t('procedure_appeal_agenda_empty')}</p>
                    <p class="mt-1 text-xs text-muted-foreground">
                      {t('procedure_appeal_agenda_empty_hint')}
                    </p>
                  </div>
                {:else}
                  <div class="space-y-2">
                    {#each orderedAgenda as item, index (item.id)}
                      <div
                        class="flex items-center gap-3 rounded-xl border bg-background px-3 py-2.5"
                      >
                        <span
                          class="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
                        >
                          {index + 1}
                        </span>
                        {#if editingAgenda}
                          <Input
                            class="h-8 flex-1 text-sm"
                            value={item.title}
                            aria-label={t('procedure_appeal_item_title')}
                            onblur={(event) =>
                              updateAgendaTitle(item.id, event.currentTarget.value)}
                          />
                          <div class="flex shrink-0 items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              class="size-7"
                              aria-label={t('procedure_appeal_move_up')}
                              disabled={index === 0}
                              onclick={() => moveAgendaItem(item.id, -1)}
                            >
                              <ArrowUp size={13} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              class="size-7"
                              aria-label={t('procedure_appeal_move_down')}
                              disabled={index === orderedAgenda.length - 1}
                              onclick={() => moveAgendaItem(item.id, 1)}
                            >
                              <ArrowDown size={13} />
                            </Button>
                          </div>
                        {:else}
                          <span class="min-w-0 flex-1 truncate text-sm font-medium">
                            {item.title}
                          </span>
                        {/if}
                      </div>
                    {/each}
                  </div>
                {/if}

                {#if editingAgenda}
                  <div class="flex gap-2 rounded-xl border border-dashed p-3">
                    <Input
                      bind:value={newAgendaTitle}
                      class="h-9"
                      placeholder={t('procedure_appeal_new_item_placeholder')}
                      onkeydown={(event) => {
                        if (event.key === 'Enter') addAgendaItem()
                      }}
                    />
                    <Button
                      variant="outline"
                      class="shrink-0 gap-1.5"
                      disabled={!newAgendaTitle.trim()}
                      onclick={addAgendaItem}
                    >
                      <Plus size={14} />
                      {t('procedure_appeal_add_item')}
                    </Button>
                  </div>
                {/if}

                {#if formError}
                  <p class="text-xs text-destructive">{formError}</p>
                {/if}

                <div class="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="outline"
                    class="gap-2"
                    onclick={() => (editingAgenda = !editingAgenda)}
                  >
                    <Pencil size={15} />
                    {editingAgenda
                      ? t('procedure_appeal_finish_editing')
                      : t('procedure_appeal_revise_agenda')}
                  </Button>
                  <Button class="gap-2" disabled={!orderedAgenda.length} onclick={acceptAgenda}>
                    <Check size={15} />
                    {t('procedure_appeal_accept_agenda')}
                  </Button>
                </div>
              </Card.Content>
            {:else if workflow.stage === 'evaluation_debate'}
              <div class="border-b px-6 py-4">
                <div>
                  <h2 class="text-base font-semibold">
                    {t('procedure_appeal_evaluation_title')}
                  </h2>
                  <p class="text-xs text-muted-foreground">
                    {t('procedure_appeal_evaluation_description')}
                  </p>
                </div>
              </div>
              <Card.Content class="space-y-5 pt-6">
                <div class="rounded-2xl border bg-muted/20 p-5">
                  <p class="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    {t('procedure_appeal_current_item')}
                  </p>
                  <h3 class="mt-1 text-xl font-semibold">
                    {currentAgendaItem?.title ?? t('procedure_appeal_no_current_item')}
                  </h3>
                  <p class="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                    {t('procedure_appeal_evaluation_body')}
                  </p>
                </div>

                <div class="rounded-2xl border bg-muted/20 p-5">
                  <div class="flex items-start gap-3">
                    <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-foreground text-background">
                      <MessageSquare size={18} />
                    </span>
                    <div class="min-w-0">
                      <h3 class="text-sm font-semibold">{t('procedure_appeal_open_chair')}</h3>
                      <p class="mt-1 text-xs leading-5 text-muted-foreground">
                        {t('procedure_appeal_open_chair_description')}
                      </p>
                    </div>
                  </div>
                  <div class="mt-4 flex justify-end">
                    <Button class="gap-2" onclick={openChair}>
                      {t('procedure_chair_workspace')}
                      <ArrowRight size={15} />
                    </Button>
                  </div>
                </div>
              </Card.Content>
            {:else if workflow.stage === 'document_reading'}
              <div class="border-b px-6 py-4">
                <div>
                  <h2 class="text-base font-semibold">
                    {t('procedure_appeal_reading_title')}
                  </h2>
                  <p class="text-xs text-muted-foreground">
                    {t('procedure_appeal_reading_description')}
                  </p>
                </div>
              </div>
              <Card.Content class="space-y-5 pt-6">
                <div class="rounded-2xl border bg-muted/20 p-8 text-center">
                  <div class="mx-auto flex size-12 items-center justify-center rounded-2xl border bg-background text-foreground">
                    <Clock3 size={23} />
                  </div>
                  <p class="mt-4 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    {workflow.reading
                      ? t('procedure_appeal_reading_remaining')
                      : t('procedure_appeal_reading_not_started')}
                  </p>
                  <p class="mt-2 font-mono text-6xl font-semibold tabular-nums tracking-tight">
                    {formatTime(workflow.reading ? readingRemainingSec : 10 * 60)}
                  </p>
                  {#if workflow.reading && readingRemainingSec === 0}
                    <p class="mt-3 text-sm text-muted-foreground">
                      {t('procedure_appeal_reading_time_is_up')}
                    </p>
                  {/if}
                </div>

                <div class="rounded-xl border bg-muted/20 p-4">
                  <label class="mb-1.5 block text-sm font-medium" for="appeal-pcn-file-name">
                    {t('procedure_appeal_pcn_file_name')}
                  </label>
                  <Input
                    id="appeal-pcn-file-name"
                    bind:value={pcnFileName}
                    placeholder={t('procedure_appeal_pcn_file_name_placeholder')}
                    onblur={persistPcnFileName}
                  />
                  <p class="mt-1.5 text-xs text-muted-foreground">
                    {t('procedure_appeal_pcn_file_name_hint')}
                  </p>
                </div>

                <div class="flex flex-wrap justify-end gap-2">
                  {#if !workflow.reading}
                    <Button
                      class="gap-2"
                      disabled={!pcnFileName.trim()}
                      onclick={startReading}
                    >
                      <Clock3 size={16} />
                      {t('procedure_appeal_start_reading')}
                    </Button>
                  {:else}
                    <Button variant="outline" class="gap-2" onclick={startReading}>
                      <Clock3 size={16} />
                      {t('procedure_appeal_restart_reading')}
                    </Button>
                    <Button
                      class="gap-2"
                      disabled={!pcnFileName.trim()}
                      onclick={finishReading}
                    >
                      <ArrowRight size={16} />
                      {t('procedure_appeal_finish_reading')}
                    </Button>
                  {/if}
                </div>
              </Card.Content>
            {:else if workflow.stage === 'negotiation_decision'}
              <div class="border-b px-6 py-4">
                <div>
                  <h2 class="text-base font-semibold">
                    {t('procedure_appeal_negotiation_title')}
                  </h2>
                  <p class="text-xs text-muted-foreground">
                    {t('procedure_appeal_negotiation_description')}
                  </p>
                </div>
              </div>
              <Card.Content class="space-y-5 pt-6">
                <div class="mx-auto max-w-xl text-center">
                  <div class="mx-auto flex size-16 rotate-45 items-center justify-center rounded-2xl border bg-muted/30">
                    <Workflow size={25} class="-rotate-45 text-foreground" />
                  </div>
                  <h3 class="mt-6 text-2xl font-semibold">
                    {t('procedure_appeal_further_negotiation_question')}
                  </h3>
                  <p class="mt-2 text-sm leading-6 text-muted-foreground">
                    {t('procedure_appeal_further_negotiation_body')}
                  </p>
                </div>

                <div class="rounded-xl border bg-muted/20 px-4 py-3 text-sm">
                  <span class="text-muted-foreground">{t('procedure_appeal_pcn_file_name')}</span>
                  <span class="ml-2 font-medium">
                    {pcnDisplayName}
                  </span>
                </div>

                <div class="flex flex-col gap-3">
                  <Button
                    variant="outline"
                    class="group h-auto w-full justify-between gap-4 whitespace-normal rounded-xl border bg-background p-4 text-left transition hover:bg-muted/40"
                    onclick={() => decideNegotiation(true)}
                  >
                    <span class="flex min-w-0 items-start gap-3">
                      <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
                        <Handshake size={17} />
                      </span>
                      <span class="min-w-0">
                        <span class="block text-sm font-semibold">
                          {t('procedure_appeal_needs_negotiation')}
                        </span>
                        <span class="mt-1 block text-xs leading-5 text-muted-foreground">
                          {t('procedure_appeal_needs_negotiation_description')}
                        </span>
                      </span>
                    </span>
                    <ArrowRight size={16} class="shrink-0 text-muted-foreground" />
                  </Button>
                  <Button
                    variant="outline"
                    class="group h-auto w-full justify-between gap-4 whitespace-normal rounded-xl border bg-background p-4 text-left transition hover:bg-muted/40"
                    onclick={() => decideNegotiation(false)}
                  >
                    <span class="flex min-w-0 items-start gap-3">
                      <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
                        <FileCheck2 size={17} />
                      </span>
                      <span class="min-w-0">
                        <span class="block text-sm font-semibold">
                          {t('procedure_appeal_no_negotiation')}
                        </span>
                        <span class="mt-1 block text-xs leading-5 text-muted-foreground">
                          {t('procedure_appeal_no_negotiation_description')}
                        </span>
                      </span>
                    </span>
                    <ArrowRight size={16} class="shrink-0 text-muted-foreground" />
                  </Button>
                </div>
              </Card.Content>
            {:else if workflow.stage === 'consensus_meeting'}
              <div class="border-b px-6 py-4">
                <div>
                  <h2 class="text-base font-semibold">
                    {t('procedure_appeal_consensus_title')}
                  </h2>
                  <p class="text-xs text-muted-foreground">
                    {t('procedure_appeal_consensus_description')}
                  </p>
                </div>
              </div>
              <Card.Content class="space-y-5 pt-6">
                <div class="rounded-xl border bg-muted/20 px-4 py-3 text-sm">
                  <span class="text-muted-foreground">{t('procedure_appeal_pcn_file_name')}</span>
                  <span class="ml-2 font-medium">
                    {pcnDisplayName}
                  </span>
                </div>
                <div class="rounded-2xl border bg-muted/20 p-8 text-center">
                  <div class="mx-auto flex size-12 items-center justify-center rounded-2xl border bg-background text-foreground">
                    <Clock3 size={23} />
                  </div>
                  <p class="mt-4 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    {workflow.consensusReading
                      ? t('procedure_appeal_consensus_remaining')
                      : t('procedure_appeal_consensus_not_started')}
                  </p>
                  <p class="mt-2 font-mono text-6xl font-semibold tabular-nums tracking-tight">
                    {formatTime(workflow.consensusReading ? consensusRemainingSec : 10 * 60)}
                  </p>
                  {#if workflow.consensusReading && consensusRemainingSec === 0}
                    <p class="mt-3 text-sm text-muted-foreground">
                      {t('procedure_appeal_consensus_time_is_up')}
                    </p>
                  {/if}
                </div>

                <div class="flex flex-wrap justify-end gap-2">
                  {#if !workflow.consensusReading}
                    <Button class="gap-2" onclick={startConsensusReading}>
                      <Clock3 size={16} />
                      {t('procedure_appeal_start_consensus')}
                    </Button>
                  {:else}
                    <Button variant="outline" class="gap-2" onclick={startConsensusReading}>
                      <Clock3 size={16} />
                      {t('procedure_appeal_restart_consensus')}
                    </Button>
                    <Button class="gap-2" onclick={finishConsensusReading}>
                      <ArrowRight size={16} />
                      {t('procedure_appeal_finish_consensus')}
                    </Button>
                  {/if}
                </div>
              </Card.Content>
            {:else if workflow.stage === 'pcn_finalization'}
              <div class="border-b px-6 py-4">
                <div>
                  <h2 class="text-base font-semibold">
                    {t('procedure_appeal_finalization_title')}
                  </h2>
                  <p class="text-xs text-muted-foreground">
                    {t('procedure_appeal_finalization_description')}
                  </p>
                </div>
              </div>
              <Card.Content class="space-y-5 pt-6">
                <div class="rounded-xl border bg-muted/20 p-5">
                  <p class="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    {t('procedure_appeal_final_document')}
                  </p>
                  <h3 class="mt-1 text-xl font-semibold">
                    {pcnDisplayName}
                  </h3>
                </div>

                <div class="grid gap-2">
                  <div class="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm">
                    <span class="flex size-5 items-center justify-center rounded-full bg-muted text-foreground">
                      <Check size={12} />
                    </span>
                    {t('procedure_appeal_check_reading')}
                  </div>
                  <div class="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm">
                    <span class="flex size-5 items-center justify-center rounded-full bg-muted text-foreground">
                      <Check size={12} />
                    </span>
                    {workflow.negotiation?.needed
                      ? t('procedure_appeal_check_consensus')
                      : t('procedure_appeal_check_no_negotiation')}
                  </div>
                </div>

                <div class="flex justify-end border-t pt-5">
                  <Button class="gap-2" onclick={finalizePcn}>
                    <FileCheck2 size={17} />
                    {t('procedure_appeal_finalize_and_file')}
                  </Button>
                </div>
              </Card.Content>
            {:else}
              <Card.Content class="py-14 text-center">
                <div class="mx-auto flex size-16 items-center justify-center rounded-full border bg-muted text-foreground">
                  <Check size={30} strokeWidth={2.5} />
                </div>
                <h2 class="mt-5 text-2xl font-semibold">
                  {t('procedure_appeal_item_complete_title')}
                </h2>
                <p class="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                  {t('procedure_appeal_item_complete_description', {
                    value1: pcnDisplayName
                  })}
                </p>
                <div
                  class="mx-auto mt-5 max-w-md rounded-xl border bg-muted/20 px-4 py-3 text-left"
                >
                  <div class="min-w-0">
                    <p class="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      {t('procedure_appeal_filed_pcn')}
                    </p>
                    <p class="mt-1 truncate text-sm font-medium">
                      {pcnDisplayName}
                    </p>
                  </div>
                </div>
                <div class="mt-6 flex flex-wrap justify-center gap-2">
                  {#if nextAgendaItem}
                    <Button class="gap-2" onclick={moveToNextItem}>
                      <ArrowRight size={16} />
                      {t('procedure_appeal_move_to_next', { value1: nextAgendaItem.title })}
                    </Button>
                  {:else}
                    <Badge variant="outline" class="h-fit gap-1.5 px-3 py-1.5">
                      <Check size={13} />
                      {t('procedure_appeal_all_items_complete')}
                    </Badge>
                  {/if}
                </div>
              </Card.Content>
            {/if}
          </Card.Root>
        </main>

      </div>
    </div>
  </div>

{/if}
