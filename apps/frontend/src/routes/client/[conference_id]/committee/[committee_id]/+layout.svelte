<script lang="ts">
  import {
    procedureMessage,
    renderProcedureMessage,
    type ProcedureMessage
  } from '$lib/components/conference/common/message'
  import { t } from '$lib/i18n'
  import {
    Activity,
    ArrowLeft,
    FolderOpen,
    Globe,
    House,
    Monitor,
    Newspaper,
    Plus,
    RefreshCw,
    ScrollText,
    Settings,
    UserRoundCheck,
    Users
  } from '@lucide/svelte'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/stores'
  import GlobalSidebar from '$lib/components/global-sidebar.svelte'
  import DisplayOnlyDialog from '$lib/components/conference/display-only-dialog.svelte'
  import DynamicIsland from '$lib/components/dynamic-island.svelte'
  import { Button } from '$lib/components/ui/button'
  import * as Sidebar from '$lib/components/ui/sidebar'
  import { conferences } from '$lib/classes/stores/conference/conference-store'
  import { cn, navigateToConference } from '$lib/classes/utils'
  import { cloudSession } from '$lib/classes/stores/cloud/cloud-session-store.svelte'
  import { fileNotifications } from '$lib/classes/stores/cloud/file-notification-store.svelte'
  import { getChairRosterEntries } from '$lib/classes/utils/committee/chair-presentation'
  import { ScrollArea } from '$lib/components/ui/scroll-area'
  import {
    createConferenceDialogOpen,
    settingsDialogOpen
  } from '$lib/classes/stores/app/global-ui-store'
  import { getCloudTimeline, type CloudTimeline } from '$lib/classes/clients/cloud-situation-client'
  import StatusBar from '$lib/components/app-sidebar/status-bar.svelte'

  let { children } = $props()
  let displayOnlyDialogOpen = $state(false)

  const recentConferences = $derived([...$conferences].reverse().slice(0, 5))
  const conferenceId = $derived($page.params.conference_id ?? '')
  const committeeId = $derived($page.params.committee_id ?? '')
  const inCommittee = $derived($page.url.pathname.includes('/committee/'))
  const activeConference = $derived(
    $conferences.find((conference) => conference.id === conferenceId) ?? null
  )

  const activeCommittee = $derived(
    activeConference?.committees.find((committee) => committee.id === committeeId) ?? null
  )
  const participantSeats = $derived(activeCommittee?.participantSeats ?? [])
  const committeeRoute = $derived(`/client/${conferenceId}/committee/${committeeId}`)
  const cloudResult = $derived(
    cloudSession.session?.result.conferenceId === conferenceId &&
      cloudSession.session?.result.identity.committeeId === committeeId
      ? cloudSession.session.result
      : null
  )
  const cloudIdentity = $derived(cloudResult?.identity ?? null)
  const seatName = $derived(cloudResult?.seatShortName || cloudResult?.seatName)
  const isCloudSession = $derived(cloudIdentity !== null)
  const canControlConference = $derived(
    !isCloudSession || cloudSession.hasCapability('control_conference')
  )
  const canViewDirectives = $derived(
    isCloudSession && cloudSession.hasCapability('submit_directive', 'process_directive')
  )
  const canViewFiles = $derived(
    isCloudSession &&
      cloudSession.hasCapability('view_files', 'send_files', 'review_files', 'withdraw_files')
  )

  $effect(() => {
    const session = isCloudSession ? cloudSession.session?.result : null
    if (!session?.token || !session.wsUrl) return
    return fileNotifications.connect(
      session.token,
      session.wsUrl,
      session.conferenceId,
      session.identity.seatId
    )
  })
  const canViewSituation = $derived(
    isCloudSession &&
      cloudSession.hasCapability(
        'view_situation',
        'publish_situation',
        'withdraw_situation',
        'control_timeline'
      )
  )
  const canViewCloudTimeline = $derived(
    isCloudSession &&
      cloudSession.hasCapability('view_situation', 'publish_situation', 'control_timeline')
  )
  let cloudTimeline = $state<CloudTimeline | null>(null)
  let cloudTimelineTimezone = $state('Asia/Shanghai')
  let cloudTimelineReceivedAt = $state(0)
  let cloudTimelineLoading = $state(false)
  let cloudTimelineError = $state<ProcedureMessage>('')
  let cloudTimelineRequest = 0

  async function refreshCloudTimeline(token: string): Promise<void> {
    const request = ++cloudTimelineRequest
    cloudTimelineLoading = true
    try {
      const result = await getCloudTimeline(token)
      if (request !== cloudTimelineRequest) return
      cloudTimeline = result.timeline
      cloudTimelineTimezone = result.timezone
      cloudTimelineReceivedAt = Date.now()
      cloudTimelineError = ''
    } catch (error) {
      if (request !== cloudTimelineRequest) return
      cloudTimelineError =
        error instanceof Error
          ? error.message
          : procedureMessage('procedure_failed_to_refresh_timeline')
    } finally {
      if (request === cloudTimelineRequest) cloudTimelineLoading = false
    }
  }

  $effect(() => {
    const token = canViewCloudTimeline ? cloudSession.session?.result.token : undefined
    if (!token) {
      cloudTimelineRequest += 1
      cloudTimeline = null
      cloudTimelineError = ''
      cloudTimelineLoading = false
      return
    }
    cloudTimeline = null
    cloudTimelineReceivedAt = 0
    cloudTimelineError = ''
    void refreshCloudTimeline(token)
    const unsubscribe = fileNotifications.subscribe(['timeline'], () => refreshCloudTimeline(token))
    return () => {
      unsubscribe()
      cloudTimelineRequest += 1
    }
  })
  const canViewNews = $derived(
    isCloudSession &&
      cloudSession.hasCapability('view_news', 'draft_news', 'review_news', 'withdraw_news')
  )
  const cloudProjection = $derived(
    cloudSession.chairProjection?.conference.id === conferenceId &&
      cloudSession.chairProjection?.committee.id === committeeId
      ? cloudSession.chairProjection
      : null
  )
  const isChair = $derived(canControlConference)
  const rosterEntries = $derived(
    getChairRosterEntries(participantSeats, cloudProjection?.chairSeat.id)
  )
  const displayConferenceName = $derived(
    cloudIdentity
      ? (cloudProjection?.conference.name ?? cloudResult?.conferenceName ?? activeConference?.name)
      : activeConference?.name
  )
  const displayCommitteeName = $derived(
    cloudIdentity
      ? (cloudProjection?.committee.name ?? cloudResult?.committeeName ?? activeCommittee?.name)
      : activeCommittee?.name
  )

  $effect(() => {
    void cloudSession.ensureChairProjection(conferenceId, committeeId)
  })

  function goTo(path: string): void {
    // @ts-expect-error resolve requires a literal route type for dynamic paths.
    goto(resolve(path))
  }
</script>

<GlobalSidebar fullWidth collapsible="none">
  {#snippet heading()}
    <div class="flex min-w-0 flex-1 items-center gap-3">
      <Button
        variant="secondary"
        size="icon"
        class="no-drag shrink-0"
        onclick={() => goto(resolve('/conference'))}
        title={t('procedure_return_home')}
        aria-label={t('procedure_return_home')}
      >
        <ArrowLeft />
      </Button>
      <div class="drag-region flex min-w-0 flex-1 flex-col gap-0.5 py-2">
        <p class="flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground">
          <span class="shrink-0">Veto</span>
          <span aria-hidden="true">/</span>
          <span class="truncate" title={displayConferenceName}>
            {displayConferenceName ?? t('procedure_current_conference')}
          </span>
        </p>
        <p class="truncate text-sm font-medium" title={displayCommitteeName}>
          {displayCommitteeName ?? t('procedure_current_committee')}
        </p>
      </div>
    </div>
  {/snippet}

  {#snippet sidebar()}
    <Sidebar.Content>
      {#if inCommittee && (isCloudSession || (activeConference && activeCommittee))}
        <Sidebar.Menu class="p-3">
          {#if isChair}
            <Sidebar.MenuItem>
              <Sidebar.MenuButton
                isActive={$page.url.pathname.startsWith(`${committeeRoute}/chair`) &&
                  !$page.url.pathname.startsWith(`${committeeRoute}/chair/participants`)}
                onclick={() => goTo(`${committeeRoute}/chair`)}
              >
                <Users />
                <span>{t('procedure_chair')}</span>
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
          {/if}

          {#if canControlConference && !isCloudSession}
            <Sidebar.MenuItem>
              <Sidebar.MenuButton
                isActive={$page.url.pathname.startsWith(`${committeeRoute}/chair/participants`)}
                onclick={() => goTo(`${committeeRoute}/chair/participants`)}
              >
                <UserRoundCheck />
                <span>{t('procedure_seat_management')}</span>
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
          {/if}

          {#if canViewDirectives || canViewFiles || canViewSituation || canViewNews}
            <Sidebar.Separator class="my-1" />
            <Sidebar.MenuItem>
              {#if canViewDirectives}
                <Sidebar.MenuButton
                  isActive={$page.url.pathname === `${committeeRoute}/directives`}
                  onclick={() => goTo(`${committeeRoute}/directives`)}
                >
                  <ScrollText />
                  <span>{t('procedure_directives')}</span>
                </Sidebar.MenuButton>
              {/if}
            </Sidebar.MenuItem>
            <Sidebar.MenuItem>
              {#if canViewFiles}
                <Sidebar.MenuButton
                  isActive={$page.url.pathname === `${committeeRoute}/files`}
                  onclick={() => goTo(`${committeeRoute}/files`)}
                >
                  <FolderOpen />
                  <span>{t('procedure_files')}</span>
                </Sidebar.MenuButton>
              {/if}
            </Sidebar.MenuItem>
            <Sidebar.MenuItem>
              {#if canViewSituation}
                <Sidebar.MenuButton
                  isActive={$page.url.pathname === `${committeeRoute}/situation`}
                  onclick={() => goTo(`${committeeRoute}/situation`)}
                >
                  <Activity />
                  <span>{t('procedure_situation_updates')}</span>
                </Sidebar.MenuButton>
              {/if}
            </Sidebar.MenuItem>
            <Sidebar.MenuItem>
              {#if canViewNews}
                <Sidebar.MenuButton
                  isActive={$page.url.pathname === `${committeeRoute}/news`}
                  onclick={() => goTo(`${committeeRoute}/news`)}
                >
                  <Newspaper />
                  <span>{t('procedure_news')}</span>
                </Sidebar.MenuButton>
              {/if}
            </Sidebar.MenuItem>
          {/if}

          {#if canControlConference}
            <!-- 代表团列表 -->
            <div class="flex flex-1 flex-col">
              {#if cloudSession.chairError}
                <p class="px-5 pb-3 text-xs text-destructive">{cloudSession.chairError}</p>
              {:else if cloudSession.loadingChairProjection}
                <p class="px-5 pb-3 text-xs text-muted-foreground">
                  {t('procedure_loading_seat_information')}
                </p>
              {:else}
                <ScrollArea class="flex-1 overflow-hidden">
                  <div class="px-3 pb-3">
                    {#each rosterEntries as delegation (delegation.id)}
                      <div
                        class={cn(
                          'flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors',
                          delegation.isPresent ? '' : 'opacity-50'
                        )}
                      >
                        <span class="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                          {delegation.name}
                        </span>
                        <span class="shrink-0 text-[10px]">
                          {#if delegation.isVoter}
                            <span class="text-emerald-500">●</span>
                          {:else if delegation.isObserver}
                            <span class="text-blue-500">●</span>
                          {:else}
                            <span class="text-muted-foreground/40">○</span>
                          {/if}
                        </span>
                      </div>
                    {/each}
                  </div>
                </ScrollArea>
              {/if}
            </div>
          {/if}
        </Sidebar.Menu>
      {:else}
        <Sidebar.Menu class="p-3">
          <Sidebar.MenuItem>
            <Sidebar.MenuButton isActive={$page.url.pathname === '/'} onclick={() => goTo('/')}>
              <House />
              <span>{t('procedure_home')}</span>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>

          <Sidebar.MenuItem>
            <Sidebar.MenuButton onclick={() => createConferenceDialogOpen.set(true)}>
              <Plus />
              <span>{t('procedure_create_conference')}</span>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>

          <Sidebar.Separator class="my-1" />

          {#each recentConferences as conference (conference.id)}
            <Sidebar.MenuItem>
              <Sidebar.MenuButton onclick={() => navigateToConference(conference.id)}>
                <Globe />
                <span>{conference.name}</span>
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
          {/each}

          {#if recentConferences.length === 0}
            <div
              class="px-2 py-3 text-center text-xs text-muted-foreground group-data-[collapsible=icon]:hidden"
            >
              {t('procedure_no_recent_conferences')}
            </div>
          {/if}
        </Sidebar.Menu>
      {/if}
    </Sidebar.Content>
  {/snippet}

  {#snippet toolbar()}
    <div class="drag-region flex h-full min-w-0 flex-1 items-center justify-center">
      {#if !isCloudSession || canViewCloudTimeline}
        <div class="client-timeline no-drag flex min-w-0 items-center gap-1">
          <DynamicIsland
            cloudMode={isCloudSession}
            {cloudTimeline}
            cloudTimezone={cloudTimelineTimezone}
            {cloudTimelineReceivedAt}
          />
          {#if canViewCloudTimeline}
            <Button
              variant="ghost"
              size="icon-xs"
              class={`no-drag pointer-events-auto text-muted-foreground hover:text-foreground ${cloudTimelineError ? 'text-destructive' : ''}`}
              disabled={cloudTimelineLoading}
              onclick={() => void refreshCloudTimeline(cloudSession.session?.result.token ?? '')}
              title={cloudTimelineError
                ? renderProcedureMessage(cloudTimelineError)
                : t('procedure_refresh_timeline')}
              aria-label={t('procedure_refresh_timeline')}
            >
              <RefreshCw class={cloudTimelineLoading ? 'animate-spin' : ''} />
            </Button>
          {/if}
        </div>
      {/if}
    </div>

    {#if cloudIdentity}
      <div
        class="flex min-w-0 max-w-32 shrink-0 flex-col gap-0.5 text-right sm:max-w-44"
        title={`${cloudIdentity.displayName} · ${seatName} · ${cloudIdentity.roleName}`}
        aria-label={t('procedure_current_identity')}
      >
        <span class="truncate text-xs font-medium">{cloudIdentity.displayName}</span>
        <span class="truncate text-[10px] text-muted-foreground">
          {seatName} · {cloudIdentity.roleName}
        </span>
      </div>
    {/if}

    <Button
      variant="ghost"
      size="sm"
      class="no-drag px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      onclick={() => (displayOnlyDialogOpen = true)}
      title={t('procedure_display_window')}
      aria-label={t('procedure_display_window')}
    >
      <Monitor />
    </Button>
    <Button
      variant="ghost"
      class="no-drag shrink-0 px-3"
      onclick={() => settingsDialogOpen.set(true)}
      title={t('settings_title')}
      aria-label={t('settings_title')}
    >
      <Settings />
    </Button>
  {/snippet}

  {#snippet footer()}
    <StatusBar />
  {/snippet}

  {#if isCloudSession && fileNotifications.latest}
    <div
      class="mx-6 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/25 bg-primary/5 px-4 py-2 text-sm"
    >
      <span>
        {fileNotifications.latest.kind === 'file.submitted'
          ? t('procedure_new_files_await_review')
          : fileNotifications.latest.kind === 'file.published'
            ? t('procedure_a_file_has_been_approved')
            : fileNotifications.latest.kind === 'file.rejected'
              ? t('procedure_a_file_was_returned_check_the_review_note')
              : t('procedure_a_new_file_visibility_request_is_available')}
      </span>
      <div class="flex gap-2">
        <Button variant="outline" size="sm" onclick={() => goTo(`${committeeRoute}/files`)}>
          {t('procedure_view_files')}
        </Button>
        <Button variant="ghost" size="sm" onclick={() => fileNotifications.dismiss()}>
          {t('procedure_close')}
        </Button>
      </div>
    </div>
  {/if}
  {@render children()}
</GlobalSidebar>

<DisplayOnlyDialog bind:open={displayOnlyDialogOpen} />

<style>
  .drag-region {
    -webkit-app-region: drag;
  }
  .no-drag {
    -webkit-app-region: no-drag;
  }

  @media (max-width: 1023px) {
    .client-timeline :global([data-slot='button']) {
      display: none;
    }
  }

  @media (max-width: 767px) {
    .client-timeline {
      display: none;
    }
  }
</style>
