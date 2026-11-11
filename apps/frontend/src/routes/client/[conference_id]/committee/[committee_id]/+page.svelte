<script lang="ts">
  import { untrack } from 'svelte'
  import { page } from '$app/stores'
  import { resolve } from '$app/paths'
  import { Activity, ArrowUpRight, Clock3, Newspaper, RefreshCw } from '@lucide/svelte'
  import DOMPurify from 'dompurify'
  import { marked } from 'marked'
  import { t, formatDate } from '$lib/i18n'
  import { cloudSession } from '$lib/classes/stores/cloud/cloud-session-store.svelte'
  import { fileNotifications } from '$lib/classes/stores/cloud/file-notification-store.svelte'
  import { conferences } from '$lib/classes/stores/conference/conference-store'
  import {
    getCloudTimeline,
    listCloudSituations,
    type CloudTimeline,
    type CloudSituation
  } from '$lib/classes/clients/cloud-situation-client'
  import { listPublishedNews } from '$lib/classes/clients/cloud-news-client'
  import type { News } from '$lib/classes/types/delegate'
  import {
    procedureMessage,
    renderProcedureMessage,
    type ProcedureMessage
  } from '$lib/components/conference/common/message'
  import DynamicIsland from '$lib/components/dynamic-island.svelte'
  import { Button } from '$lib/components/ui/button'
  import * as Card from '$lib/components/ui/card'

  type Section = 'timeline' | 'situations' | 'news'
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
  const canViewTimeline = $derived(
    !!token && cloudSession.hasCapability('view_situation', 'publish_situation', 'control_timeline')
  )
  const canViewSituation = $derived(!!token && cloudSession.hasCapability('view_situation'))
  const canViewNews = $derived(!!token && cloudSession.hasCapability('view_news'))

  let timeline = $state<CloudTimeline | null>(null)
  let timelineTimezone = $state('Asia/Shanghai')
  let timelineReceivedAt = $state(0)
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
  const situationHtml = $derived(
    latestSituation
      ? DOMPurify.sanitize(marked.parse(latestSituation.content, { async: false }))
      : ''
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
</script>

<svelte:head><title>{t('procedure_overview')} · Veto</title></svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
  <div class="flex flex-col gap-1">
    <p class="text-sm text-muted-foreground">{conferenceName} / {committeeName}</p>
    <h1 class="text-2xl font-semibold">{t('procedure_overview')}</h1>
  </div>

  {#if !session || canViewTimeline}
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
            <DynamicIsland
              expanded
              cloudMode={!!session}
              cloudTimeline={timeline}
              cloudTimezone={timelineTimezone}
              cloudTimelineReceivedAt={timelineReceivedAt}
            />
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
              <article class="overview-markdown min-w-0 text-sm leading-7">
                {@html situationHtml}
              </article>
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
  {:else if !session}
    <p class="text-sm text-muted-foreground">{t('procedure_offline_overview_description')}</p>
  {/if}
</div>

<style>
  .overview-markdown {
    overflow-wrap: anywhere;
  }
  .overview-markdown :global(p) {
    margin-block: 0.5rem;
  }
  .overview-markdown :global(ul),
  .overview-markdown :global(ol) {
    padding-left: 1.5rem;
  }
  .overview-markdown :global(ul) {
    list-style: disc;
  }
  .overview-markdown :global(ol) {
    list-style: decimal;
  }
  .overview-markdown :global(img) {
    max-width: 100%;
  }
  .overview-markdown :global(pre) {
    overflow-x: auto;
  }
</style>
