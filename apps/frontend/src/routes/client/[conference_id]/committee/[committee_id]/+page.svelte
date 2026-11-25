<script lang="ts">
  import { untrack } from 'svelte'
  import { page } from '$app/stores'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import {
    Activity,
    AlertTriangle,
    ArrowRight,
    ArrowUpRight,
    Check,
    Clock3,
    Copy,
    FileText,
    ListChecks,
    Newspaper,
    RefreshCw,
    Users
  } from '@lucide/svelte'
  import { t, formatDate, formatNumber, type MessageKey } from '$lib/i18n'
  import { cloudSession } from '$lib/classes/stores/cloud/cloud-session-store.svelte'
  import { fileNotifications } from '$lib/classes/stores/cloud/file-notification-store.svelte'
  import {
    conferences,
    currentCommittee
  } from '$lib/classes/stores/conference/conference-store'
  import {
    getCloudTimeline,
    listCloudSituations,
    type CloudTimeline,
    type CloudSituation
  } from '$lib/classes/clients/cloud-situation-client'
  import { listPublishedNews } from '$lib/classes/clients/cloud-news-client'
  import type { News } from '$lib/classes/types/delegate'
  import type { AppealWorkflowEventType, AppealWorkflowStage } from '$lib/classes/types/appeal'
  import { MOTION_MESSAGE_KEYS } from '$lib/classes/types/committee'
  import {
    procedureMessage,
    renderProcedureMessage,
    type ProcedureMessage
  } from '$lib/components/conference/common/message'
  import MarkdownContent from '$lib/components/conference/common/markdown-content.svelte'
  import { Badge } from '$lib/components/ui/badge'
  import { Button } from '$lib/components/ui/button'
  import * as Card from '$lib/components/ui/card'
  import { cn } from '$lib/classes/utils'
  import { formatTime } from '$lib/classes/formatters/time-formater'
  import { PHASE_LABELS } from '$lib/classes/utils/committee/phase'
  import {
    calculateQuorum,
    defaultProcedureRules
  } from '$lib/classes/utils/committee/procedure-rules'

  type Section = 'timeline' | 'situations' | 'news'
  type AgendaRemark = { key: MessageKey; values?: Record<string, string | number> }

  const STAGE_MESSAGE_KEYS: Record<AppealWorkflowStage, MessageKey> = {
    roll_call: 'procedure_appeal_step_roll_call',
    agenda: 'procedure_appeal_step_agenda',
    evaluation_debate: 'procedure_appeal_step_evaluation',
    document_reading: 'procedure_appeal_step_reading',
    negotiation_decision: 'procedure_appeal_step_negotiation',
    consensus_meeting: 'procedure_appeal_step_consensus',
    pcn_finalization: 'procedure_appeal_step_finalization',
    item_complete: 'procedure_agenda_stage_complete'
  }

  const ACTION_MESSAGE_KEYS: Record<AppealWorkflowStage, MessageKey> = {
    roll_call: 'procedure_agenda_action_roll_call',
    agenda: 'procedure_agenda_action_confirm_agenda',
    evaluation_debate: 'procedure_agenda_action_evaluation',
    document_reading: 'procedure_agenda_action_reading',
    negotiation_decision: 'procedure_agenda_action_negotiation',
    consensus_meeting: 'procedure_agenda_action_consensus',
    pcn_finalization: 'procedure_agenda_action_finalize',
    item_complete: 'procedure_agenda_action_next'
  }

  const EVENT_MESSAGE_KEYS: Record<AppealWorkflowEventType, MessageKey> = {
    roll_call_confirmed: 'procedure_appeal_event_roll_call_confirmed',
    agenda_accepted: 'procedure_appeal_event_agenda_accepted',
    evaluation_started: 'procedure_appeal_event_evaluation_started',
    evaluation_ended: 'procedure_appeal_event_evaluation_ended',
    pcn_saved: 'procedure_appeal_event_pcn_saved',
    reading_started: 'procedure_appeal_event_reading_started',
    reading_completed: 'procedure_appeal_event_reading_completed',
    negotiation_requested: 'procedure_appeal_event_negotiation_requested',
    negotiation_skipped: 'procedure_appeal_event_negotiation_skipped',
    revision_saved: 'procedure_appeal_event_revision_saved',
    consensus_reading_started: 'procedure_appeal_event_consensus_reading_started',
    consensus_reading_completed: 'procedure_appeal_event_consensus_reading_completed',
    consensus_confirmed: 'procedure_appeal_event_consensus_confirmed',
    pcn_finalized: 'procedure_appeal_event_pcn_finalized',
    next_item_started: 'procedure_appeal_event_next_item_started'
  }

  const conferenceId = $derived($page.params.conference_id ?? '')
  const committeeId = $derived($page.params.committee_id ?? '')
  const session = $derived(
    cloudSession.session?.result.conferenceId === conferenceId &&
      cloudSession.session.result.committeeId === committeeId
      ? cloudSession.session.result
      : null
  )
  const token = $derived(session?.token ?? '')
  const conference = $derived($conferences.find((candidate) => candidate.id === conferenceId))
  const conferenceName = $derived(
    session?.conferenceName ?? conference?.name ?? t('procedure_current_conference')
  )
  const committeeName = $derived(
    session?.committeeName ??
      conference?.committees.find((candidate) => candidate.id === committeeId)?.name ??
      t('procedure_current_committee')
  )
  const committee = $derived(
    $currentCommittee?.id === committeeId
      ? $currentCommittee
      : conference?.committees.find((candidate) => candidate.id === committeeId)
  )
  const agendaMode = $derived(committee?.agendaMode ?? false)
  const orderedAgenda = $derived(
    [...(committee?.agenda ?? [])].sort((left, right) => left.sortOrder - right.sortOrder)
  )
  const workflow = $derived(committee?.appealWorkflow)
  const agendaRows = $derived.by(() => {
    const completed = new Set(workflow?.completedAgendaItemIds ?? [])
    return orderedAgenda.map((item) => {
      const status = completed.has(item.id)
        ? 'completed'
        : workflow?.currentAgendaItemId === item.id
          ? 'current'
          : 'pending'
      return {
        item,
        status,
        pcn: workflow?.pcnByAgendaItemId[item.id] ?? null
      } as const
    })
  })
  const completedAgendaCount = $derived(
    agendaRows.filter((row) => row.status === 'completed').length
  )
  const pendingAgendaCount = $derived(
    agendaRows.filter((row) => row.status === 'pending').length
  )
  const canOpenAgendaWorkflow = $derived(
    !session || cloudSession.hasCapability('control_conference')
  )
  const presentSeatCount = $derived(committee?.getPresentCount() ?? 0)
  const votingSeatCount = $derived(committee?.getVotingCount() ?? 0)
  const participantSeatCount = $derived(committee?.participantSeats.length ?? 0)
  const canViewTimeline = $derived(
    !!token && cloudSession.hasCapability('view_situation', 'publish_situation', 'control_timeline')
  )
  const canViewSituation = $derived(!!token && cloudSession.hasCapability('view_situation'))
  const canViewNews = $derived(!!token && cloudSession.hasCapability('view_news'))

  $effect(() => {
    if (!conference || conference.source === 'cloud' || !committee) return
    if (committee.agendaMode) {
      void goto(
        resolve('/client/[conference_id]/committee/[committee_id]/chair/appeal', {
          conference_id: conferenceId,
          committee_id: committeeId
        }),
        { replaceState: true }
      )
    } else {
      void goto(
        resolve('/client/[conference_id]/committee/[committee_id]/chair', {
          conference_id: conferenceId,
          committee_id: committeeId
        }),
        { replaceState: true }
      )
    }
  })

  let timeline = $state<CloudTimeline | null>(null)
  let timelineTimezone = $state('Asia/Shanghai')
  let timelineReceivedAt = $state(0)
  let clockNow = $state(Date.now())
  let copiedTimeline = $state(false)
  let situations = $state<CloudSituation[]>([])
  let situationTimezone = $state('Asia/Shanghai')
  let news = $state<News[]>([])
  let newsTimezone = $state('Asia/Shanghai')
  let loading = $state<Record<Section, boolean>>({
    timeline: false,
    situations: false,
    news: false
  })
  let errors = $state<Record<Section, ProcedureMessage>>({ timeline: '', situations: '', news: '' })
  const requests: Record<Section, number> = { timeline: 0, situations: 0, news: 0 }
  const currentAgendaItem = $derived(
    orderedAgenda.find((item) => item.id === workflow?.currentAgendaItemId) ?? null
  )
  const currentAgendaPcn = $derived(
    workflow?.currentAgendaItemId
      ? (workflow.pcnByAgendaItemId[workflow.currentAgendaItemId] ?? null)
      : null
  )
  const latestAgendaPcnVersion = $derived(
    currentAgendaPcn?.versions.at(-1) ?? null
  )
  const procedureRules = $derived(
    committee?.procedureRules ?? defaultProcedureRules(committee?.substantiveVotingMajority)
  )
  const quorum = $derived(
    committee ? calculateQuorum(committee.participantSeats, procedureRules.quorum) : null
  )
  const currentSpeakerName = $derived.by(() => {
    const entry = committee?.currentSpeaker
    return entry ? (committee?.getSpeakerSeatName(entry) ?? entry.seatId) : null
  })
  const currentMotion = $derived(committee?.motions.find((motion) => motion.status === 'pending') ?? null)
  const currentStageLabel = $derived(
    workflow ? t(STAGE_MESSAGE_KEYS[workflow.stage]) : t('procedure_appeal_step_roll_call')
  )
  const nextActionLabel = $derived.by(() => {
    const stage = workflow?.stage
    if (!stage) return t('procedure_agenda_action_roll_call')
    if (stage === 'document_reading') {
      return workflow.reading ? t('procedure_appeal_finish_reading') : t('procedure_appeal_start_reading')
    }
    if (stage === 'item_complete' && pendingAgendaCount === 0) {
      return t('procedure_agenda_action_all_complete')
    }
    return t(ACTION_MESSAGE_KEYS[stage])
  })
  const readingRemainingSec = $derived.by(() => {
    const reading = workflow?.reading
    if (!reading) return 0
    if (reading.completedAt) return 0
    return Math.max(
      0,
      Math.ceil((reading.startedAt + reading.durationSec * 1000 - clockNow) / 1000)
    )
  })
  const agendaReminders = $derived.by((): AgendaRemark[] => {
    if (!agendaMode) return []
    const stage = workflow?.stage
    const reminders: AgendaRemark[] = []
    if (orderedAgenda.length === 0) {
      reminders.push({ key: 'procedure_agenda_reminder_add_items' })
    }
    if (stage === 'roll_call') {
      reminders.push({ key: 'procedure_agenda_reminder_roll_call' })
    }
    if (stage === 'agenda') {
      reminders.push({ key: 'procedure_agenda_reminder_confirm_agenda' })
    }
    if (stage === 'evaluation_debate' && !latestAgendaPcnVersion?.content.trim()) {
      reminders.push({ key: 'procedure_agenda_reminder_pcn_draft' })
    }
    if (stage === 'document_reading' && workflow?.reading && readingRemainingSec === 0) {
      reminders.push({ key: 'procedure_agenda_reminder_reading_due' })
    }
    if (stage === 'negotiation_decision') {
      reminders.push({ key: 'procedure_agenda_reminder_decide_negotiation' })
    }
    if (stage === 'consensus_meeting') {
      reminders.push({ key: 'procedure_agenda_reminder_consensus' })
    }
    if (stage === 'pcn_finalization') {
      reminders.push({ key: 'procedure_agenda_reminder_finalize' })
    }
    if (pendingAgendaCount > 0) {
      reminders.push({
        key: 'procedure_agenda_reminder_pending_items',
        values: { value1: formatNumber(pendingAgendaCount) }
      })
    }
    if (
      quorum &&
      !quorum.met &&
      stage !== 'item_complete' &&
      committee?.participantSeats.length
    ) {
      reminders.push({ key: 'procedure_agenda_reminder_quorum' })
    }
    return reminders.slice(0, 5)
  })
  const recentAgendaEvents = $derived([...(workflow?.events ?? [])].slice(-5).reverse())
  const timelineTime = $derived(
    timeline
      ? timeline.currentTime +
          (timeline.paused ? 0 : (clockNow - timelineReceivedAt) * timeline.ratio)
      : null
  )
  const latestSituation = $derived(
    [...situations]
      .filter((item) => item.status === 'published')
      .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt))[0]
  )
  const latestNews = $derived(
    [...news]
      .filter((item) => item.status === 'published')
      .sort(
        (left, right) =>
          Date.parse(right.publishedAt ?? right.createdAt) -
          Date.parse(left.publishedAt ?? left.createdAt)
      )
      .slice(0, 5)
  )

  async function loadSection<Result>(
    section: Section,
    request: (requestToken: string) => Promise<Result>,
    apply: (result: Result) => void,
    fallback: ProcedureMessage
  ): Promise<void> {
    const requestToken = token
    if (!requestToken) return
    const sequence = ++requests[section]
    loading[section] = true
    try {
      const result = await request(requestToken)
      if (sequence !== requests[section] || requestToken !== token) return
      apply(result)
      errors[section] = ''
    } catch (error) {
      if (sequence !== requests[section] || requestToken !== token) return
      console.error('[client-overview] Content refresh failed; keeping the last loaded content', {
        section,
        conferenceId,
        committeeId,
        error
      })
      errors[section] = error instanceof Error ? error.message : fallback
    } finally {
      if (sequence === requests[section]) loading[section] = false
    }
  }

  function refreshTimeline(): Promise<void> {
    return loadSection(
      'timeline',
      getCloudTimeline,
      (result) => {
        timeline = result.timeline
        timelineTimezone = result.timezone
        timelineReceivedAt = Date.now()
      },
      procedureMessage('procedure_failed_to_refresh_timeline')
    )
  }

  function refreshSituations(): Promise<void> {
    return loadSection(
      'situations',
      listCloudSituations,
      (result) => {
        situations = result.situations
        situationTimezone = result.timezone
      },
      procedureMessage('procedure_failed_to_load_situation_updates')
    )
  }

  function refreshNews(): Promise<void> {
    return loadSection(
      'news',
      listPublishedNews,
      (result) => {
        news = result.news
        newsTimezone = result.timezone
      },
      procedureMessage('procedure_failed_to_load_news')
    )
  }

  $effect(() => {
    const availableToken = token
    const showTimeline = canViewTimeline
    const showSituations = canViewSituation
    const showNews = canViewNews
    timeline = null
    situations = []
    news = []
    errors = { timeline: '', situations: '', news: '' }
    loading = { timeline: false, situations: false, news: false }
    if (!availableToken) return
    const subscriptions = untrack(() => {
      const unsubscribe: (() => void)[] = []
      if (showTimeline) {
        void refreshTimeline()
        unsubscribe.push(fileNotifications.subscribe(['timeline'], refreshTimeline))
      }
      if (showSituations) {
        void refreshSituations()
        unsubscribe.push(fileNotifications.subscribe(['situations'], refreshSituations))
      }
      if (showNews) {
        void refreshNews()
        unsubscribe.push(fileNotifications.subscribe(['news'], refreshNews))
      }
      return unsubscribe
    })
    return () => {
      for (const unsubscribe of subscriptions) unsubscribe()
      for (const section of ['timeline', 'situations', 'news'] as const) requests[section] += 1
    }
  })

  function contentTime(value: number, timeZone: string): string {
    return formatDate(value, {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  }

  async function copyTimelineTime(): Promise<void> {
    if (timelineTime === null) return
    await navigator.clipboard.writeText(contentTime(timelineTime, timelineTimezone))
    copiedTimeline = true
    setTimeout(() => (copiedTimeline = false), 1500)
  }

  function openAgendaWorkflow(): void {
    void goto(
      resolve('/client/[conference_id]/committee/[committee_id]/chair/appeal', {
        conference_id: conferenceId,
        committee_id: committeeId
      })
    )
  }

  function agendaStatusLabel(status: 'pending' | 'current' | 'completed'): string {
    return t(
      status === 'completed'
        ? 'procedure_agenda_completed'
        : status === 'current'
          ? 'procedure_agenda_current'
          : 'procedure_agenda_pending'
    )
  }

  function agendaStatusClass(status: 'pending' | 'current' | 'completed'): string {
    return status === 'completed'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
      : status === 'current'
        ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300'
        : 'border-border bg-muted/40 text-muted-foreground'
  }

  function pcnStatusLabel(status: string): string {
    return t(
      status === 'finalized'
        ? 'procedure_appeal_pcn_status_finalized'
        : status === 'negotiation'
          ? 'procedure_appeal_pcn_status_negotiation'
          : status === 'ready'
            ? 'procedure_appeal_pcn_status_ready'
            : status === 'reading'
              ? 'procedure_appeal_pcn_status_reading'
              : 'procedure_appeal_pcn_status_draft'
    )
  }

  function agendaEventLabel(type: AppealWorkflowEventType): string {
    return t(EVENT_MESSAGE_KEYS[type])
  }

  function agendaEventTime(timestamp: number): string {
    return formatDate(timestamp, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  }

  function reminderText(reminder: AgendaRemark): string {
    return t(reminder.key, reminder.values ?? {})
  }

  $effect(() => {
    const interval = window.setInterval(() => (clockNow = Date.now()), 1000)
    return () => window.clearInterval(interval)
  })
</script>

<svelte:head><title>{t('procedure_overview')} · Veto</title></svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
  <div class="flex flex-col gap-1">
    <p class="text-sm text-muted-foreground">{conferenceName} / {committeeName}</p>
    <h1 class="text-2xl font-semibold">{t('procedure_overview')}</h1>
  </div>

  {#if agendaMode}
    <div class="grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.85fr)]">
      <Card.Root
        class="overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50 via-background to-background dark:border-sky-900/60 dark:from-sky-950/30"
      >
        <Card.Content class="p-5">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="flex min-w-0 items-start gap-3">
              <span
                class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white shadow-sm"
              >
                <Clock3 size={20} />
              </span>
              <div class="min-w-0">
                <p class="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  {t('procedure_appeal_current_item')}
                </p>
                <h2 class="mt-1 line-clamp-2 text-lg font-semibold leading-7">
                  {currentAgendaItem?.title ?? t('procedure_appeal_no_current_item')}
                </h2>
              </div>
            </div>
            <Badge variant="outline" class="border-sky-200 bg-background/80 text-sky-700 dark:border-sky-900 dark:text-sky-300">
              {currentStageLabel}
            </Badge>
          </div>

          <div class="mt-5 grid gap-3 sm:grid-cols-3">
            <div class="rounded-lg border bg-background/70 p-3">
              <p class="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {t('procedure_appeal_pcn')}
              </p>
              <p class="mt-1.5 text-sm font-medium">
                {latestAgendaPcnVersion
                  ? `v${latestAgendaPcnVersion.version}`
                  : t('procedure_agenda_no_pcn')}
              </p>
              {#if currentAgendaPcn}
                <p class="mt-0.5 text-xs text-muted-foreground">
                  {pcnStatusLabel(currentAgendaPcn.status)}
                </p>
              {/if}
            </div>
            <div class="rounded-lg border bg-background/70 p-3">
              <p class="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {t('procedure_overview_next_action')}
              </p>
              <p class="mt-1.5 text-sm font-medium leading-5">{nextActionLabel}</p>
            </div>
            <div class="rounded-lg border bg-background/70 p-3">
              <p class="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {t('procedure_overview_completion')}
              </p>
              <p class="mt-1.5 text-sm font-medium tabular-nums">
                {formatNumber(completedAgendaCount)} / {formatNumber(orderedAgenda.length)}
              </p>
              {#if workflow?.stage === 'document_reading' && workflow.reading}
                <p class="mt-0.5 font-mono text-xs text-sky-600 dark:text-sky-300">
                  {t('procedure_overview_reading_remaining', {
                    value1: formatTime(readingRemainingSec)
                  })}
                </p>
              {/if}
            </div>
          </div>

          {#if canOpenAgendaWorkflow}
            <div class="mt-4 flex justify-end">
              <Button class="gap-2" onclick={openAgendaWorkflow}>
                {t('procedure_agenda_open_workflow')}
                <ArrowRight size={15} />
              </Button>
            </div>
          {/if}
        </Card.Content>
      </Card.Root>

      {#if canOpenAgendaWorkflow}
        <Card.Root>
          <Card.Header class="pb-3">
            <Card.Title class="flex items-center gap-2 text-sm">
              <Users size={15} class="text-violet-500" />
              {t('procedure_overview_chair_status')}
            </Card.Title>
          </Card.Header>
          <Card.Content class="space-y-4">
            <dl class="grid gap-2 text-sm sm:grid-cols-2">
              <div class="rounded-lg border bg-muted/20 p-3">
                <dt class="text-xs text-muted-foreground">{t('procedure_current_phase')}</dt>
                <dd class="mt-1 font-medium">{PHASE_LABELS[committee?.phase ?? 'preamble']}</dd>
              </div>
              <div class="rounded-lg border bg-muted/20 p-3">
                <dt class="text-xs text-muted-foreground">{t('procedure_attendance')}</dt>
                <dd class="mt-1 font-medium tabular-nums">
                  {formatNumber(presentSeatCount)} / {formatNumber(participantSeatCount)}
                </dd>
              </div>
              <div class="rounded-lg border bg-muted/20 p-3">
                <dt class="text-xs text-muted-foreground">{t('procedure_voting_seats')}</dt>
                <dd class="mt-1 font-medium tabular-nums">{formatNumber(votingSeatCount)}</dd>
              </div>
              <div class="rounded-lg border bg-muted/20 p-3">
                <dt class="text-xs text-muted-foreground">{t('procedure_overview_quorum')}</dt>
                <dd class="mt-1 font-medium tabular-nums">
                  {formatNumber(quorum?.present ?? 0)} / {formatNumber(quorum?.required ?? 0)}
                </dd>
                <p
                  class={cn(
                    'mt-0.5 text-[11px]',
                    quorum?.met
                      ? 'text-emerald-600 dark:text-emerald-300'
                      : 'text-amber-600 dark:text-amber-300'
                  )}
                >
                  {quorum?.met
                    ? t('procedure_overview_quorum_met')
                    : t('procedure_overview_quorum_unmet')}
                </p>
              </div>
            </dl>

            {#if currentSpeakerName || currentMotion}
              <div class="space-y-2 border-t pt-3 text-sm">
                {#if currentMotion}
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-muted-foreground">{t('procedure_overview_current_motion')}</span>
                    <span class="text-right font-medium">
                      {t(MOTION_MESSAGE_KEYS[currentMotion.type])}
                    </span>
                  </div>
                {/if}
                {#if currentSpeakerName}
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-muted-foreground">{t('procedure_overview_current_speaker')}</span>
                    <span class="truncate text-right font-medium">{currentSpeakerName}</span>
                  </div>
                {/if}
              </div>
            {:else}
              <p class="border-t pt-3 text-xs text-muted-foreground">
                {t('procedure_overview_no_active_speaker_or_motion')}
              </p>
            {/if}
          </Card.Content>
        </Card.Root>
      {/if}
    </div>

    <Card.Root
      class={cn(
        'border-amber-200/70 bg-amber-50/40 dark:border-amber-900/60 dark:bg-amber-950/15',
        agendaReminders.length === 0 &&
          'border-emerald-200/70 bg-emerald-50/40 dark:border-emerald-900/60 dark:bg-emerald-950/15'
      )}
    >
      <Card.Header class="pb-3">
        <Card.Title class="flex items-center gap-2 text-sm">
          {#if agendaReminders.length}
            <AlertTriangle size={15} class="text-amber-500" />
          {:else}
            <Check size={15} class="text-emerald-500" />
          {/if}
          {t('procedure_overview_reminders')}
        </Card.Title>
      </Card.Header>
      <Card.Content>
        {#if agendaReminders.length}
          <ul class="space-y-2">
            {#each agendaReminders as reminder, index (index)}
              <li class="flex items-start gap-2 text-sm">
                <span class="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500"></span>
                <span>{reminderText(reminder)}</span>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="text-sm text-muted-foreground">{t('procedure_overview_no_reminders')}</p>
        {/if}
      </Card.Content>
    </Card.Root>

    <section class="rounded-2xl border bg-card p-5 shadow-sm">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex min-w-0 items-start gap-3">
          <span
            class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300"
          >
            <ListChecks size={20} />
          </span>
          <div class="min-w-0">
            <h2 class="text-base font-semibold">{t('procedure_agenda_overview_title')}</h2>
            <p class="mt-1 text-sm text-muted-foreground">
              {t('procedure_agenda_overview_description')}
            </p>
          </div>
        </div>
        <Badge variant="outline" class="h-fit shrink-0">
          {t('procedure_appeal_agenda_progress', {
            value1: completedAgendaCount,
            value2: orderedAgenda.length
          })}
        </Badge>
      </div>

      {#if agendaRows.length}
        <div class="mt-5 grid gap-3 md:grid-cols-2">
          {#each agendaRows as row, index (row.item.id)}
            <article
              class={cn(
                'rounded-xl border bg-background p-4',
                row.status === 'current' &&
                  'border-sky-300 bg-sky-50/40 dark:border-sky-800 dark:bg-sky-950/15'
              )}
            >
              <div class="flex items-start justify-between gap-3">
                <span
                  class="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
                >
                  {#if row.status === 'completed'}
                    <Check size={13} class="text-emerald-600" />
                  {:else}
                    {index + 1}
                  {/if}
                </span>
                <Badge
                  variant="outline"
                  class={agendaStatusClass(row.status)}
                >
                  {agendaStatusLabel(row.status)}
                </Badge>
              </div>
              <h3 class="mt-3 line-clamp-2 text-sm font-semibold leading-6">
                {row.item.title}
              </h3>
              <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {#if row.pcn}
                  <span class="rounded-md bg-muted px-2 py-1">
                    PCN v{row.pcn.versions.at(-1)?.version ?? 1}
                  </span>
                  <span>{pcnStatusLabel(row.pcn.status)}</span>
                {:else}
                  <span>{t('procedure_agenda_no_pcn')}</span>
                {/if}
              </div>
            </article>
          {/each}
        </div>
      {:else}
        <p class="mt-5 rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          {t('procedure_agenda_empty')}
        </p>
      {/if}

      {#if canOpenAgendaWorkflow}
        <div class="mt-4 flex justify-end">
          <Button class="gap-2" onclick={openAgendaWorkflow}>
            {t('procedure_agenda_open_workflow')}
            <ArrowRight size={15} />
          </Button>
        </div>
      {/if}
    </section>

    <Card.Root>
      <Card.Header class="pb-3">
        <Card.Title class="flex items-center gap-2 text-sm">
          <Activity size={15} class="text-violet-500" />
          {t('procedure_overview_recent_activity')}
        </Card.Title>
      </Card.Header>
      <Card.Content>
        {#if recentAgendaEvents.length}
          <div class="space-y-3">
            {#each recentAgendaEvents as event (event.id)}
              <div class="flex gap-2.5">
                <span class="mt-1.5 size-1.5 shrink-0 rounded-full bg-violet-400"></span>
                <div class="min-w-0 flex-1">
                  <div class="flex items-start justify-between gap-2">
                    <p class="text-xs font-medium leading-5">{agendaEventLabel(event.type)}</p>
                    <time class="shrink-0 text-[10px] text-muted-foreground">
                      {agendaEventTime(event.at)}
                    </time>
                  </div>
                  {#if event.detail}
                    <p class="truncate text-[11px] text-muted-foreground" title={event.detail}>
                      {event.detail}
                    </p>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-sm text-muted-foreground">{t('procedure_overview_no_recent_activity')}</p>
        {/if}
      </Card.Content>
    </Card.Root>
  {/if}

  {#if session && canViewTimeline}
    <Card.Root>
      <Card.Header class="flex flex-row items-center justify-between gap-3">
        <Card.Title class="flex items-center gap-2">
          <Clock3 class="size-4" />{t('procedure_conference_time')}
        </Card.Title>
        {#if canViewTimeline}
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={loading.timeline}
            onclick={refreshTimeline}
            aria-label={t('procedure_refresh_timeline')}
            title={t('procedure_refresh_timeline')}
          >
            <RefreshCw class={loading.timeline ? 'animate-spin' : ''} />
          </Button>
        {/if}
      </Card.Header>
      <Card.Content class="flex flex-col gap-3">
        {#if errors.timeline}<p role="alert" class="text-sm text-destructive">
            {renderProcedureMessage(errors.timeline)}
          </p>{/if}
        {#if loading.timeline && !timeline}
          <p class="text-sm text-muted-foreground">{t('procedure_loading')}</p>
        {:else}
          <div class="flex min-w-0 justify-start">
            {#if timeline && timelineTime !== null}
              <div class="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                <Clock3 class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span class="truncate text-muted-foreground" title={timeline.name}>
                  {timeline.name}
                </span>
                <span class="whitespace-nowrap font-mono text-lg font-medium tabular-nums">
                  {contentTime(timelineTime, timelineTimezone)}
                </span>
                <span class="whitespace-nowrap text-muted-foreground">
                  {timeline.paused ? t('components_pause') : `${timeline.ratio}x`}
                </span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  class="size-5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  title={t('components_copy_sim_time')}
                  aria-label={t('components_copy_sim_time')}
                  onclick={copyTimelineTime}
                >
                  {#if copiedTimeline}
                    <Check size={11} />
                  {:else}
                    <Copy size={11} />
                  {/if}
                </Button>
              </div>
            {:else}
              <div class="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock3 class="size-3.5" aria-hidden="true" />
                {t('components_no_timeline')}
              </div>
            {/if}
          </div>
        {/if}
      </Card.Content>
    </Card.Root>
  {/if}

  {#if canViewSituation || canViewNews}
    <div class="grid items-start gap-6 lg:grid-cols-2">
      {#if canViewSituation}
        <Card.Root>
          <Card.Header class="flex flex-row items-center justify-between gap-3">
            <Card.Title class="flex items-center gap-2">
              <Activity class="size-4" />{t('procedure_latest_situation')}
            </Card.Title>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={loading.situations}
              onclick={refreshSituations}
              aria-label={t('procedure_refresh_situations')}
              title={t('procedure_refresh_situations')}
            >
              <RefreshCw class={loading.situations ? 'animate-spin' : ''} />
            </Button>
          </Card.Header>
          <Card.Content class="flex flex-col gap-4">
            {#if errors.situations}<p role="alert" class="text-sm text-destructive">
                {renderProcedureMessage(errors.situations)}
              </p>{/if}
            {#if latestSituation}
              <div class="flex flex-col gap-1 text-xs text-muted-foreground">
                <p>{contentTime(latestSituation.contentTime, situationTimezone)}</p>
                {#if latestSituation.author}
                  <p>{latestSituation.author.committeeName} · {latestSituation.author.seatName}</p>
                {/if}
              </div>
              <MarkdownContent source={latestSituation.content} class="min-w-0" />
            {:else}
              <p class="py-6 text-sm text-muted-foreground">
                {loading.situations ? t('procedure_loading') : t('procedure_no_situation_updates')}
              </p>
            {/if}
            <Button
              variant="link"
              class="h-auto self-start p-0"
              href={resolve('/client/[conference_id]/committee/[committee_id]/situation', {
                conference_id: conferenceId,
                committee_id: committeeId
              })}
            >
              {t('procedure_view_all_situations')}<ArrowUpRight data-icon="inline-end" />
            </Button>
          </Card.Content>
        </Card.Root>
      {/if}
      {#if canViewNews}
        <Card.Root>
          <Card.Header class="flex flex-row items-center justify-between gap-3">
            <Card.Title class="flex items-center gap-2">
              <Newspaper class="size-4" />{t('procedure_conference_news')}
            </Card.Title>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={loading.news}
              onclick={refreshNews}
              aria-label={t('procedure_refresh_news')}
              title={t('procedure_refresh_news')}
            >
              <RefreshCw class={loading.news ? 'animate-spin' : ''} />
            </Button>
          </Card.Header>
          <Card.Content class="flex flex-col gap-4">
            {#if errors.news}<p role="alert" class="text-sm text-destructive">
                {renderProcedureMessage(errors.news)}
              </p>{/if}
            {#if latestNews.length}
              <div class="flex flex-col divide-y">
                {#each latestNews as item (item.id)}
                  <article class="flex flex-col gap-2 py-4 first:pt-0">
                    <h3 class="text-sm font-medium">{item.title}</h3>
                    <p class="text-xs text-muted-foreground">
                      {item.source} · {contentTime(item.contentTime, newsTimezone)}
                    </p>
                    <p
                      class="line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground"
                    >
                      {item.content}
                    </p>
                  </article>
                {/each}
              </div>
            {:else}
              <p class="py-6 text-sm text-muted-foreground">
                {loading.news ? t('procedure_loading') : t('procedure_no_news')}
              </p>
            {/if}
            <Button
              variant="link"
              class="h-auto self-start p-0"
              href={resolve('/client/[conference_id]/committee/[committee_id]/news', {
                conference_id: conferenceId,
                committee_id: committeeId
              })}
            >
              {t('procedure_view_all_news')}<ArrowUpRight data-icon="inline-end" />
            </Button>
          </Card.Content>
        </Card.Root>
      {/if}
    </div>
  {/if}
</div>

