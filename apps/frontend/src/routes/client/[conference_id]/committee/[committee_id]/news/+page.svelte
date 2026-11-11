<script lang="ts">
  import { procedureMessage, renderProcedureMessage, type ProcedureMessage } from '$lib/components/conference/common/message'
  import { t, getLocale } from '$lib/i18n'
  import { onMount } from 'svelte'
  import { fileNotifications } from '$lib/classes/stores/cloud/file-notification-store.svelte'
  import { Newspaper, RefreshCw, Send } from '@lucide/svelte'
  import type { News } from '$lib/classes/types/delegate'
  import { cloudSession } from '$lib/classes/stores/cloud/cloud-session-store.svelte'
  import { getCloudTimeline, type CloudTimeline } from '$lib/classes/clients/cloud-situation-client'
  import {
    CloudNewsError, newsDraftPrefix, listPublishedNews, listMyNews, listNewsWorkflow,
    listNewsRevisions, submitCloudNews, resubmitCloudNews, reviewCloudNews,
    withdrawCloudNews, type NewsRevision
  } from '$lib/classes/clients/cloud-news-client'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Label } from '$lib/components/ui/label'
  import { Textarea } from '$lib/components/ui/textarea'
  import * as Card from '$lib/components/ui/card'
  import { Badge } from '$lib/components/ui/badge'

  type Tab = 'published' | 'mine' | 'workflow'
  let tab = $state<Tab>('published')
  let published = $state<News[]>([])
  let mine = $state<News[]>([])
  let workflow = $state<News[]>([])
  let timeline = $state<CloudTimeline | null>(null)
  let timezone = $state('Asia/Shanghai')
  let source = $state('')
  let title = $state('')
  let content = $state('')
  let manualTime = $state('')
  let submissionKey = $state<string>(crypto.randomUUID())
  let editingId = $state<string | null>(null)
  let selectedId = $state<string | null>(null)
  let decisionNote = $state('')
  let withdrawalReason = $state('')
  let revisions = $state<NewsRevision[]>([])
  let otherDraft = $state<{ seatId: string; source: string; title: string; content: string } | null>(null)
  let ready = $state(false)
  let loading = $state(false)
  let busy = $state(false)
  let error = $state<ProcedureMessage>('')
  let draftError = $state<ProcedureMessage>('')
  const token = $derived(cloudSession.session?.result.token ?? '')
  const identity = $derived(cloudSession.session?.result.identity)
  const canView = $derived(cloudSession.hasCapability('view_news'))
  const canDraft = $derived(cloudSession.session?.result.committeeType === 'mpc' && cloudSession.hasCapability('draft_news'))
  const canReview = $derived(cloudSession.hasCapability('review_news'))
  const canWithdraw = $derived(cloudSession.hasCapability('withdraw_news'))
  const draftKey = $derived(identity ? `${newsDraftPrefix}${identity.conferenceId}:${identity.seatId}` : '')
  const currentList = $derived(tab === 'published' ? published : tab === 'mine' ? mine : workflow)

  function formatTime(value: number): string {
    return new Intl.DateTimeFormat(getLocale(), {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).format(value)
  }

  function validManualTime(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false
    const timestamp = Date.parse(`${value}:00+08:00`)
    return Number.isSafeInteger(timestamp) &&
      new Date(timestamp + 8 * 60 * 60 * 1000).toISOString().slice(0, 16) === value
  }

  function input() {
    return {
      source: source.trim(), title: title.trim(), content: content.trim(),
      ...(!timeline ? { contentTime: Date.parse(`${manualTime}:00+08:00`) } : {})
    }
  }

  function message(caught: unknown, fallback: ProcedureMessage): ProcedureMessage {
    return caught instanceof CloudNewsError ? caught.message : fallback
  }

  async function load(): Promise<void> {
    if (!token) return
    loading = true
    try {
      const [publicResult, mineResult, workflowResult, timelineResult] = await Promise.all([
        canView ? listPublishedNews(token) : Promise.resolve(null),
        canDraft ? listMyNews(token) : Promise.resolve(null),
        canReview ? listNewsWorkflow(token) : Promise.resolve(null),
        canDraft ? getCloudTimeline(token) : Promise.resolve(null)
      ])
      published = publicResult?.news ?? []
      mine = mineResult?.news ?? []
      workflow = workflowResult?.news ?? []
      timezone = publicResult?.timezone ?? mineResult?.timezone ?? workflowResult?.timezone ?? timelineResult?.timezone ?? 'Asia/Shanghai'
      timeline = timelineResult?.timeline ?? null
      error = ''
    } catch (caught) {
      error = message(caught, procedureMessage('procedure_failed_to_load_news'))
    } finally {
      loading = false
    }
  }

  function clearEditor(): void {
    source = ''
    title = ''
    content = ''
    manualTime = ''
    editingId = null
    submissionKey = crypto.randomUUID()
    if (draftKey) localStorage.removeItem(draftKey)
  }

  async function submit(): Promise<void> {
    if (!token || !canDraft || busy || !source.trim() || !title.trim() || !content.trim()) return
    if (!timeline && !validManualTime(manualTime)) {
      error = procedureMessage('procedure_enter_a_valid_content_time_utc_8')
      return
    }
    busy = true
    try {
      if (editingId) await resubmitCloudNews(token, editingId, input())
      else await submitCloudNews(token, input(), submissionKey)
      clearEditor()
      tab = 'mine'
      await load()
    } catch (caught) {
      error = message(caught, procedureMessage('procedure_failed_to_submit_news'))
    } finally {
      busy = false
    }
  }

  function edit(item: News): void {
    editingId = item.id
    source = item.source
    title = item.title
    content = item.content
    manualTime = new Date(item.contentTime + 8 * 60 * 60 * 1000).toISOString().slice(0, 16)
    tab = 'mine'
  }

  async function openItem(item: News): Promise<void> {
    selectedId = selectedId === item.id ? null : item.id
    decisionNote = ''
    withdrawalReason = ''
    revisions = []
    if (selectedId === item.id && tab === 'mine') {
      try {
        revisions = (await listNewsRevisions(token, item.id)).revisions
      } catch (caught) {
        error = message(caught, procedureMessage('procedure_failed_to_load_revision_history'))
      }
    }
  }

  async function decide(item: News, decision: 'approve' | 'reject'): Promise<void> {
    if (!token || busy || (decision === 'reject' && !decisionNote.trim())) return
    busy = true
    try {
      await reviewCloudNews(token, item.id, decision, decisionNote.trim())
      selectedId = null
      await load()
    } catch (caught) {
      error = message(caught, procedureMessage('procedure_failed_to_review_news'))
      if (caught instanceof CloudNewsError && caught.status === 409) await load()
    } finally {
      busy = false
    }
  }

  async function withdraw(item: News): Promise<void> {
    if (!token || busy || !withdrawalReason.trim()) return
    busy = true
    try {
      await withdrawCloudNews(token, item.id, withdrawalReason.trim())
      selectedId = null
      await load()
    } catch (caught) {
      error = message(caught, procedureMessage('procedure_failed_to_withdraw_news'))
    } finally {
      busy = false
    }
  }

  onMount(() => {
    if (draftKey) {
      try {
        const saved = JSON.parse(localStorage.getItem(draftKey) ?? 'null') as Record<string, unknown> | null
        if (saved) {
          source = typeof saved.source === 'string' ? saved.source : ''
          title = typeof saved.title === 'string' ? saved.title : ''
          content = typeof saved.content === 'string' ? saved.content : ''
          manualTime = typeof saved.manualTime === 'string' ? saved.manualTime : ''
          editingId = typeof saved.editingId === 'string' ? saved.editingId : null
          submissionKey = typeof saved.submissionKey === 'string' ? saved.submissionKey : submissionKey
        }
        const prefix = `${newsDraftPrefix}${identity?.conferenceId}:`
        for (let index = 0; index < localStorage.length; index++) {
          const key = localStorage.key(index)
          if (!key?.startsWith(prefix) || key === draftKey) continue
          const value = JSON.parse(localStorage.getItem(key) ?? 'null') as Record<string, unknown> | null
          if (value && typeof value.content === 'string') {
            otherDraft = {
              seatId: key.slice(prefix.length),
              source: String(value.source ?? ''), title: String(value.title ?? ''), content: value.content
            }
            break
          }
        }
      } catch {
        draftError = procedureMessage('procedure_unable_to_read_local_draft')
      }
    }
    ready = true
    if (!canView && canDraft) tab = 'mine'
    else if (!canView && canReview) tab = 'workflow'
    void load()
    const unsubscribe = fileNotifications.subscribe(['news', 'timeline'], () => load())
    return unsubscribe
  })

  $effect(() => {
    if (!ready || !draftKey) return
    try {
      if (source || title || content || manualTime) {
        localStorage.setItem(draftKey, JSON.stringify({ source, title, content, manualTime, editingId, submissionKey }))
      } else localStorage.removeItem(draftKey)
      draftError = ''
    } catch {
      draftError = procedureMessage('procedure_failed_to_save_local_draft_copy_the_content_as_a_backup')
    }
  })
</script>

<svelte:head><title>{t('procedure_news_veto')}</title></svelte:head>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
  <header class="flex items-start justify-between gap-4">
    <div><h1 class="flex items-center gap-2 text-xl font-semibold"><Newspaper />{t('procedure_news')}</h1><p class="mt-1 text-sm text-muted-foreground">{t('procedure_conference_news_and_review')}</p></div>
    <Button variant="outline" size="sm" disabled={loading} onclick={() => void load()}><RefreshCw class={loading ? 'animate-spin' : ''} />{t('procedure_refresh')}</Button>
  </header>

  {#if !token}
    <Card.Root><Card.Content class="py-10 text-center text-muted-foreground">{t('procedure_news_is_available_in_cloud_conferences')}</Card.Content></Card.Root>
  {:else}
    {#if error}<p class="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{renderProcedureMessage(error)}</p>{/if}
    {#if draftError}<p class="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{renderProcedureMessage(draftError)}</p>{/if}
    {#if otherDraft}
      <Card.Root><Card.Header><Card.Title>{t('procedure_local_drafts_from_another_seat')}</Card.Title><Card.Description>{t('procedure_other_seat_draft_notice', { value1: otherDraft.seatId })}</Card.Description></Card.Header><Card.Content class="space-y-2"><p class="text-sm">{otherDraft.source} · {otherDraft.title}</p><Textarea readonly rows={5} value={otherDraft.content} /></Card.Content></Card.Root>
    {/if}

    {#if canDraft}
      <Card.Root>
        <Card.Header><Card.Title>{editingId ? t('procedure_revise_rejected_news') : t('procedure_draft_news')}</Card.Title><Card.Description>{t('procedure_drafts_are_saved_on_this_device_and_enter_the_conference_review_queue_after_submission')}</Card.Description></Card.Header>
        <Card.Content class="space-y-4">
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-1"><Label for="news-source">{t('procedure_news_agency')}</Label><Input id="news-source" maxlength={120} bind:value={source} /></div>
            <div class="space-y-1"><Label for="news-title">{t('procedure_title')}</Label><Input id="news-title" maxlength={200} bind:value={title} /></div>
          </div>
          {#if timeline}<p class="text-sm text-muted-foreground">{t('procedure_content_time_is_captured_from_the_conference_timeline_when_submitted_for_review')}</p>
          {:else}<div class="space-y-1"><Label for="news-time">{t('procedure_content_time_utc_8')}</Label><Input id="news-time" type="datetime-local" bind:value={manualTime} /></div>{/if}
          <div class="space-y-1"><Label for="news-content">{t('procedure_body')}</Label><Textarea id="news-content" rows={8} maxlength={20000} bind:value={content} /></div>
          <div class="flex justify-end gap-2">
            {#if editingId}<Button variant="outline" disabled={busy} onclick={clearEditor}>{t('procedure_cancel_revision')}</Button>{/if}
            <Button disabled={busy || loading || !source.trim() || !title.trim() || !content.trim() || (!timeline && !validManualTime(manualTime))} onclick={() => void submit()}><Send />{busy ? t('procedure_submitting') : t('procedure_submit_for_review')}</Button>
          </div>
        </Card.Content>
      </Card.Root>
    {/if}

    <div class="flex flex-wrap gap-2">
      {#if canView}<Button variant={tab === 'published' ? 'default' : 'outline'} onclick={() => (tab = 'published')}>{t('procedure_published_2')}</Button>{/if}
      {#if canDraft}<Button variant={tab === 'mine' ? 'default' : 'outline'} onclick={() => (tab = 'mine')}>{t('procedure_my_articles')}</Button>{/if}
      {#if canReview}<Button variant={tab === 'workflow' ? 'default' : 'outline'} onclick={() => (tab = 'workflow')}>{t('procedure_news_review_count', { value1: workflow.length })}</Button>{/if}
    </div>

    {#if loading && currentList.length === 0}<p class="py-8 text-center text-sm text-muted-foreground">{t('procedure_loading_2')}</p>
    {:else if currentList.length === 0}<Card.Root><Card.Content class="py-10 text-center text-muted-foreground">{t('procedure_no_news')}</Card.Content></Card.Root>
    {:else}
      <section class="space-y-3">
        {#each currentList as item (item.id)}
          <Card.Root>
            <Card.Header>
              <div class="flex items-start justify-between gap-4">
                <div><Card.Title>{item.title}</Card.Title><Card.Description>{item.source} · {formatTime(item.contentTime)} · {item.author?.committeeName} / {item.author?.seatName}</Card.Description></div>
                <Badge variant={item.status === 'published' ? 'default' : 'secondary'}>{item.status === 'submitted' ? t('procedure_awaiting_review') : item.status === 'rejected' ? t('procedure_rejected') : item.status === 'withdrawn' ? t('procedure_withdrawn') : t('procedure_published_2')}</Badge>
              </div>
            </Card.Header>
            <Card.Content class="space-y-3">
              <p class="whitespace-pre-wrap text-sm leading-7">{item.content}</p>
              {#if item.reviewNote}<p class="rounded-md bg-muted p-3 text-sm">{t('procedure_news_review_note', { value1: item.reviewNote })}</p>{/if}
              <div class="flex gap-2">
                {#if tab === 'mine' || (tab === 'workflow' && item.status === 'submitted') || (tab === 'published' && canWithdraw)}<Button size="sm" variant="outline" onclick={() => void openItem(item)}>{selectedId === item.id ? t('procedure_hide_actions') : t('procedure_view_actions')}</Button>{/if}
                {#if tab === 'mine' && item.status === 'rejected'}<Button size="sm" onclick={() => edit(item)}>{t('procedure_revise_and_resubmit_2')}</Button>{/if}
              </div>
              {#if selectedId === item.id}
                {#if tab === 'mine' && revisions.length > 0}<div class="space-y-2 border-t pt-3"><h3 class="text-sm font-medium">{t('procedure_revision_history')}</h3>{#each revisions as revision}<p class="text-xs text-muted-foreground">{t('procedure_news_revision_summary', { value1: revision.revision, value2: formatTime(revision.contentTime), value3: revision.decision === 'rejected' ? t('procedure_rejected_value', { value1: revision.reviewNote ?? '' }) : revision.decision === 'approved' ? t('procedure_approve_2') : t('procedure_awaiting_review') })}</p>{/each}</div>{/if}
                {#if tab === 'workflow' && canReview}
                  <div class="space-y-2 border-t pt-3"><Label for={`review-${item.id}`}>{t('procedure_review_note_required_when_rejecting')}</Label><Textarea id={`review-${item.id}`} rows={3} maxlength={2000} bind:value={decisionNote} /><div class="flex justify-end gap-2"><Button size="sm" variant="outline" disabled={busy || !decisionNote.trim()} onclick={() => void decide(item, 'reject')}>{t('procedure_reject')}</Button><Button size="sm" disabled={busy} onclick={() => void decide(item, 'approve')}>{t('procedure_approve_and_publish')}</Button></div></div>
                {/if}
                {#if tab === 'published' && canWithdraw}<div class="space-y-2 border-t pt-3"><Label for={`withdraw-${item.id}`}>{t('procedure_withdrawal_reason')}</Label><Textarea id={`withdraw-${item.id}`} rows={2} maxlength={500} bind:value={withdrawalReason} /><div class="flex justify-end"><Button size="sm" variant="destructive" disabled={busy || !withdrawalReason.trim()} onclick={() => void withdraw(item)}>{t('procedure_confirm_withdrawal')}</Button></div></div>{/if}
              {/if}
            </Card.Content>
          </Card.Root>
        {/each}
      </section>
    {/if}
  {/if}
</div>
