<script lang="ts">
  import { procedureMessage, renderProcedureMessage, type ProcedureMessage } from '$lib/components/conference/common/message'
  import { t, getLocale } from '$lib/i18n'
  import { onMount } from 'svelte'
  import { fileNotifications } from '$lib/classes/stores/cloud/file-notification-store.svelte'
  import { Activity, Clock3, Pause, Play, RefreshCw, Send, SkipForward } from '@lucide/svelte'
  import DOMPurify from 'dompurify'
  import { marked } from 'marked'
  import { cloudSession } from '$lib/classes/stores/cloud/cloud-session-store.svelte'
  import {
    CloudSituationError,
    cloudApiBaseUrl,
    controlCloudTimeline,
    getCloudTimeline,
    listCloudSituations,
    publishCloudSituation,
    withdrawCloudSituation
  } from '$lib/classes/clients/cloud-situation-client'
  import type {
    CloudSituation as SituationUpdate,
    CloudTimeline as TimelineProjection
  } from '$lib/classes/clients/cloud-situation-client'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Label } from '$lib/components/ui/label'
  import { Textarea } from '$lib/components/ui/textarea'
  import * as Card from '$lib/components/ui/card'
  import { Badge } from '$lib/components/ui/badge'

  let situations = $state<SituationUpdate[]>([])
  let timeline = $state<TimelineProjection | null>(null)
  let timezone = $state('Asia/Shanghai')
  let content = $state('')
  let manualTime = $state('')
  let ratioInput = $state('')
  let jumpTime = $state('')
  let loading = $state(true)
  let submitting = $state(false)
  let controlling = $state(false)
  let withdrawingId = $state<string | null>(null)
  let withdrawing = $state(false)
  let withdrawalReason = $state('')
  let draftReady = $state(false)
  let draftError = $state<ProcedureMessage>('')
  let otherSeatDraft = $state<{ seatId: string; content: string; manualTime: string } | null>(null)
  let error = $state<ProcedureMessage>('')
  let clockNow = $state(Date.now())
  let timelineReceivedAt = $state(Date.now())
  let loadSequence = 0

  const token = $derived(cloudSession.session?.result.token ?? '')
  const identity = $derived(cloudSession.session?.result.identity)
  const canView = $derived(cloudSession.hasCapability('view_situation'))
  const canPublish = $derived(
    cloudSession.session?.result.committeeType === 'ipc' &&
      cloudSession.hasCapability('publish_situation')
  )
  const canWithdraw = $derived(cloudSession.hasCapability('withdraw_situation'))
  const canControl = $derived(
    cloudSession.session?.result.committeeType === 'ipc' &&
      cloudSession.hasCapability('control_timeline')
  )
  const canSeeTimeline = $derived(canView || canPublish || canControl)
  const draftKey = $derived(
    identity
      ? `veto.situation-draft:${cloudApiBaseUrl}:${identity.conferenceId}:${identity.seatId}`
      : ''
  )
  const draftPrefix = $derived(
    identity ? `veto.situation-draft:${cloudApiBaseUrl}:${identity.conferenceId}:` : ''
  )
  const currentTimelineTime = $derived(
    timeline
      ? timeline.currentTime +
          (timeline.paused ? 0 : (clockNow - timelineReceivedAt) * timeline.ratio)
      : null
  )

  function formatTime(value: number): string {
    return new Intl.DateTimeFormat(getLocale(), {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(value)
  }

  function parseChinaTime(value: string): number {
    return Date.parse(`${value}:00+08:00`)
  }

  function validChinaTime(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false
    const timestamp = parseChinaTime(value)
    return (
      Number.isSafeInteger(timestamp) &&
      new Date(timestamp + 8 * 60 * 60 * 1000).toISOString().slice(0, 16) === value
    )
  }

  function markdown(value: string): string {
    return DOMPurify.sanitize(marked.parse(value, { async: false }) as string)
  }

  async function load(silent = false): Promise<void> {
    if (controlling) return
    if (!token) {
      loading = false
      return
    }
    const sequence = ++loadSequence
    if (!silent) loading = true
    try {
      const [situationResult, timelineResult] = await Promise.all([
        canView ? listCloudSituations(token) : Promise.resolve(null),
        canSeeTimeline ? getCloudTimeline(token) : Promise.resolve(null)
      ])
      if (sequence !== loadSequence || token !== cloudSession.session?.result.token) return
      situations = situationResult?.situations ?? []
      timezone = situationResult?.timezone ?? timelineResult?.timezone ?? 'Asia/Shanghai'
      timeline = timelineResult?.timeline ?? null
      timelineReceivedAt = Date.now()
      error = ''
    } catch (caught) {
      if (sequence !== loadSequence) return
      error = caught instanceof CloudSituationError ? caught.message : procedureMessage('procedure_failed_to_load_situation_updates')
    } finally {
      if (sequence === loadSequence) loading = false
    }
  }

  async function publish(): Promise<void> {
    if (!token || !canPublish || !content.trim() || submitting) return
    if (!timeline && !validChinaTime(manualTime)) {
      error = procedureMessage('procedure_enter_a_valid_content_time_utc_8')
      return
    }
    submitting = true
    try {
      await publishCloudSituation(token, {
        content: content.trim(),
        ...(!timeline ? { contentTime: parseChinaTime(manualTime) } : {})
      })
      content = ''
      manualTime = ''
      if (draftKey) localStorage.removeItem(draftKey)
      await load(true)
    } catch (caught) {
      error = caught instanceof CloudSituationError ? caught.message : procedureMessage('procedure_failed_to_publish_situation_update')
    } finally {
      submitting = false
    }
  }

  async function withdraw(item: SituationUpdate): Promise<void> {
    const reason = withdrawalReason.trim()
    if (
      !token ||
      !canWithdraw ||
      !reason ||
      reason.length > 500 ||
      withdrawingId !== item.id ||
      withdrawing
    )
      return
    withdrawing = true
    try {
      await withdrawCloudSituation(token, item.id, reason)
      withdrawingId = null
      withdrawalReason = ''
      await load(true)
    } catch (caught) {
      error = caught instanceof CloudSituationError ? caught.message : procedureMessage('procedure_failed_to_withdraw_situation_update')
    } finally {
      withdrawing = false
    }
  }

  async function control(
    input:
      | { action: 'pause' | 'resume' }
      | { action: 'set_ratio'; ratio: number }
      | { action: 'jump'; contentTime: number }
  ): Promise<void> {
    if (!token || !canControl || !timeline || controlling) return
    ++loadSequence
    loading = false
    controlling = true
    let conflictMessage = ''
    try {
      const result = await controlCloudTimeline(token, input)
      timeline = result.timeline
      timelineReceivedAt = Date.now()
      ratioInput = ''
      jumpTime = ''
      error = ''
    } catch (caught) {
      if (caught instanceof CloudSituationError && caught.status === 409)
        conflictMessage = caught.message
      error = caught instanceof CloudSituationError ? caught.message : procedureMessage('procedure_failed_to_control_timeline')
    } finally {
      controlling = false
    }
    if (conflictMessage) {
      await load(true)
      error = conflictMessage
    }
  }

  onMount(() => {
    if (draftKey) {
      try {
        const saved = JSON.parse(localStorage.getItem(draftKey) ?? 'null') as unknown
        if (
          saved &&
          typeof saved === 'object' &&
          'content' in saved &&
          typeof saved.content === 'string'
        ) {
          content = saved.content
          if ('manualTime' in saved && typeof saved.manualTime === 'string')
            manualTime = saved.manualTime
        }
        for (let index = 0; index < localStorage.length; index += 1) {
          const key = localStorage.key(index)
          if (!key?.startsWith(draftPrefix) || key === draftKey) continue
          const value = JSON.parse(localStorage.getItem(key) ?? 'null') as unknown
          if (
            value &&
            typeof value === 'object' &&
            'content' in value &&
            typeof value.content === 'string'
          ) {
            otherSeatDraft = {
              seatId: key.slice(draftPrefix.length),
              content: value.content,
              manualTime:
                'manualTime' in value && typeof value.manualTime === 'string'
                  ? value.manualTime
                  : ''
            }
            break
          }
        }
      } catch {
        draftError = procedureMessage('procedure_unable_to_read_local_draft')
      }
    }
    draftReady = true
    void load()
    const clock = window.setInterval(() => (clockNow = Date.now()), 1000)
    const unsubscribe = fileNotifications.subscribe(['situations', 'timeline'], () => load(true))
    return () => {
      window.clearInterval(clock)
      unsubscribe()
    }
  })

  $effect(() => {
    if (!draftReady || !draftKey) return
    try {
      if (content || manualTime) {
        localStorage.setItem(draftKey, JSON.stringify({ content, manualTime }))
      } else {
        localStorage.removeItem(draftKey)
      }
      draftError = ''
    } catch {
      draftError = procedureMessage('procedure_failed_to_save_local_draft_copy_the_body_as_a_backup_2')
    }
  })
</script>

<svelte:head><title>{t('procedure_situation_updates_veto')}</title></svelte:head>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
  <header class="flex items-start justify-between gap-4">
    <div>
      <h1 class="flex items-center gap-2 text-xl font-semibold"><Activity />{t('procedure_situation_updates')}</h1>
      <p class="mt-1 text-sm text-muted-foreground">{t('procedure_conference_situation_timeline')}</p>
    </div>
    <Button variant="outline" size="sm" onclick={() => void load()} disabled={loading}>
      <RefreshCw class={loading ? 'animate-spin' : ''} />{t('procedure_refresh')}
    </Button>
  </header>

  {#if !token}
    <Card.Root>
      <Card.Content class="py-10 text-center text-muted-foreground">
        {t('procedure_situation_updates_are_available_in_cloud_conferences')}
      </Card.Content>
    </Card.Root>
  {:else}
    {#if error}<p class="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {renderProcedureMessage(error)}
      </p>{/if}
    {#if draftError}<p class="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {renderProcedureMessage(draftError)}
      </p>{/if}
    {#if otherSeatDraft}
      <Card.Root>
        <Card.Header>
          <Card.Title>{t('procedure_local_drafts_from_another_seat')}</Card.Title>
          <Card.Description>
            {t('procedure_other_seat_situation_draft_notice', { value1: otherSeatDraft.seatId })}
          </Card.Description>
        </Card.Header>
        <Card.Content class="space-y-3">
          {#if otherSeatDraft.manualTime}<p class="text-sm text-muted-foreground">
              {t('procedure_draft_content_time', { value1: otherSeatDraft.manualTime })}
            </p>{/if}
          <Textarea readonly rows={6} value={otherSeatDraft.content} />
        </Card.Content>
      </Card.Root>
    {/if}

    {#if timeline}
      <Card.Root>
        <Card.Header>
          <div class="flex items-center justify-between gap-3">
            <div>
              <Card.Title class="flex items-center gap-2"><Clock3 />{timeline.name}</Card.Title>
              <Card.Description>
                {timeline.paused ? t('procedure_paused') : t('procedure_running_at_valuex', { value1: timeline.ratio })}
              </Card.Description>
            </div>
            <Badge variant={timeline.paused ? 'secondary' : 'default'}>
              {timeline.paused ? t('procedure_pause') : t('procedure_run')}
            </Badge>
          </div>
        </Card.Header>
        <Card.Content class="space-y-4">
          <p class="font-mono text-3xl font-semibold">
            {formatTime(currentTimelineTime ?? timeline.currentTime)}
          </p>
          {#if canControl}
            <div class="flex flex-wrap items-end gap-2 border-t pt-4">
              <Button
                disabled={controlling}
                onclick={() => void control({ action: timeline?.paused ? 'resume' : 'pause' })}
              >
                {#if timeline.paused}<Play />{t('procedure_start')}{:else}<Pause />{t('procedure_pause')}{/if}
              </Button>
              <div class="space-y-1">
                <Label for="timeline-ratio">{t('procedure_positive_integer_speed_multiplier')}</Label>
                <div class="flex gap-2">
                  <Input
                    id="timeline-ratio"
                    class="w-32"
                    type="number"
                    min="1"
                    step="1"
                    bind:value={ratioInput}
                  />
                  <Button
                    variant="outline"
                    disabled={!Number.isSafeInteger(Number(ratioInput)) ||
                      Number(ratioInput) < 1 ||
                      controlling}
                    onclick={() => void control({ action: 'set_ratio', ratio: Number(ratioInput) })}
                  >
                    {t('procedure_apply')}
                  </Button>
                </div>
              </div>
              <div class="space-y-1">
                <Label for="timeline-jump">{t('procedure_jump_to_time_utc_8')}</Label>
                <div class="flex gap-2">
                  <Input id="timeline-jump" type="datetime-local" bind:value={jumpTime} />
                  <Button
                    variant="outline"
                    disabled={!validChinaTime(jumpTime) || controlling}
                    onclick={() =>
                      void control({ action: 'jump', contentTime: parseChinaTime(jumpTime) })}
                  >
                    <SkipForward />{t('procedure_jump')}
                  </Button>
                </div>
              </div>
            </div>
          {/if}
        </Card.Content>
      </Card.Root>
    {/if}

    {#if canPublish}
      <Card.Root>
        <Card.Header>
          <Card.Title>{t('procedure_publish_situation_update')}</Card.Title><Card.Description>
            {t('procedure_the_body_supports_markdown_drafts_are_saved_on_this_device_published_updates_cannot_be')}
          </Card.Description>
        </Card.Header>
        <Card.Content class="space-y-4">
          {#if !timeline}
            <div class="space-y-1.5">
              <Label for="content-time">{t('procedure_content_time_utc_8')}</Label><Input
                id="content-time"
                type="datetime-local"
                bind:value={manualTime}
              />
            </div>
          {:else}
            <p class="text-sm text-muted-foreground">{t('procedure_content_time_is_captured_from_the_conference_timeline_at_publication')}</p>
          {/if}
          <div class="space-y-1.5">
            <Label for="situation-content">{t('procedure_body')}</Label><Textarea
              id="situation-content"
              rows={8}
              maxlength={20000}
              bind:value={content}
              placeholder={t('procedure_enter_markdown_content')}
            />
          </div>
          <div class="flex justify-end">
            <Button
              disabled={!content.trim() ||
                content.trim().length > 20000 ||
                (!timeline && !validChinaTime(manualTime)) ||
                submitting ||
                loading}
              onclick={() => void publish()}
            >
              <Send />{submitting ? t('procedure_publishing') : t('procedure_publish_now')}
            </Button>
          </div>
        </Card.Content>
      </Card.Root>
    {/if}

    {#if canView}<section class="space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="font-semibold">{t('procedure_published_situation_updates')}</h2>
          <span class="text-xs text-muted-foreground">{t('procedure_situation_count', { value1: situations.length })}</span>
        </div>
        {#if loading}
          <p class="py-10 text-center text-sm text-muted-foreground">{t('procedure_loading_2')}</p>
        {:else if situations.length === 0}
          <Card.Root>
            <Card.Content class="py-10 text-center text-muted-foreground">
              {t('procedure_no_situation_updates')}
            </Card.Content>
          </Card.Root>
        {:else}
          {#each situations as item (item.id)}
            <Card.Root>
              <Card.Header>
                <div class="flex items-start justify-between gap-4">
                  <div>
                    <Card.Title class="font-mono text-base">
                      {formatTime(item.contentTime)}
                    </Card.Title><Card.Description>
                      {item.author?.committeeName} · {item.author?.seatName}{item.author?.role
                        ? ` · ${item.author.role}`
                        : ''}
                    </Card.Description>
                  </div>
                  {#if canWithdraw}<Button
                      variant="destructive"
                      size="sm"
                      disabled={withdrawingId !== null || withdrawing}
                      onclick={() => {
                        withdrawingId = item.id
                        withdrawalReason = ''
                      }}
                    >
                      {t('procedure_withdraw')}
                    </Button>{/if}
                </div>
              </Card.Header>
              <Card.Content class="space-y-4">
                <article class="markdown-body text-sm leading-7">
                  {@html markdown(item.content)}
                </article>
                {#if withdrawingId === item.id}
                  <div class="space-y-2 border-t pt-4">
                    <Label for={`withdraw-${item.id}`}>{t('procedure_withdrawal_reason_required_up_to_500_characters')}</Label>
                    <Textarea
                      id={`withdraw-${item.id}`}
                      rows={3}
                      maxlength={500}
                      bind:value={withdrawalReason}
                    />
                    <div class="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={withdrawing}
                        onclick={() => {
                          withdrawingId = null
                          withdrawalReason = ''
                        }}
                      >
                        {t('procedure_cancel')}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={!withdrawalReason.trim() ||
                          withdrawalReason.trim().length > 500 ||
                          withdrawing}
                        onclick={() => void withdraw(item)}
                      >
                        {withdrawing ? t('procedure_withdrawing') : t('procedure_confirm_withdrawal')}
                      </Button>
                    </div>
                  </div>
                {/if}
              </Card.Content>
            </Card.Root>
          {/each}
        {/if}
      </section>{/if}
  {/if}
</div>

<style>
  :global(.markdown-body p) {
    margin: 0.5rem 0;
  }
  :global(.markdown-body ul),
  :global(.markdown-body ol) {
    margin: 0.5rem 0;
    padding-left: 1.5rem;
  }
  :global(.markdown-body ul) {
    list-style: disc;
  }
  :global(.markdown-body ol) {
    list-style: decimal;
  }
  :global(.markdown-body h1),
  :global(.markdown-body h2),
  :global(.markdown-body h3) {
    margin: 1rem 0 0.5rem;
    font-weight: 650;
  }
  :global(.markdown-body code) {
    border-radius: 0.25rem;
    background: var(--muted);
    padding: 0.1rem 0.3rem;
  }
</style>
