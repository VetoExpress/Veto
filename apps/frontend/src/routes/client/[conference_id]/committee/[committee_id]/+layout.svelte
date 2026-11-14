<script lang="ts">
  import { t } from '$lib/i18n'
  import {
    Activity,
    ArrowLeft,
    FolderOpen,
    Globe,
    House,
    LayoutDashboard,
    Monitor,
    Newspaper,
    Plus,
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
  const navigation = $derived(
    [
      {
        path: committeeRoute,
        label: t('procedure_overview'),
        icon: LayoutDashboard,
        visible: isCloudSession
      },
      {
        path: `${committeeRoute}/chair`,
        label: t('procedure_chair'),
        icon: Users,
        visible: isChair
      },
      {
        path: `${committeeRoute}/chair/participants`,
        label: t('procedure_seat_management'),
        icon: UserRoundCheck,
        visible: canControlConference && !isCloudSession
      },
      {
        path: `${committeeRoute}/directives`,
        label: t('procedure_directives'),
        icon: ScrollText,
        visible: canViewDirectives
      },
      {
        path: `${committeeRoute}/situation`,
        label: t('procedure_situation_updates'),
        icon: Activity,
        visible: canViewSituation
      },
      {
        path: `${committeeRoute}/news`,
        label: t('procedure_news'),
        icon: Newspaper,
        visible: canViewNews
      },
      {
        path: `${committeeRoute}/files`,
        label: t('procedure_files'),
        icon: FolderOpen,
        visible: canViewFiles
      }
    ].filter((item) => item.visible)
  )

  function isNavigationActive(path: string): boolean {
    if (path === committeeRoute) return $page.url.pathname === path
    if (path === `${committeeRoute}/chair` && $page.url.pathname.startsWith(`${path}/participants`))
      return false
    return $page.url.pathname === path || $page.url.pathname.startsWith(`${path}/`)
  }

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
        <Sidebar.Group class="px-4 py-3">
          <Sidebar.GroupLabel class="h-auto px-3 pb-2 text-[11px] font-normal">
            {t('procedure_committee_workspace')}
          </Sidebar.GroupLabel>
          <Sidebar.Menu class="client-navigation gap-2">
            {#each navigation as item (item.path)}
              <Sidebar.MenuItem>
                <Sidebar.MenuButton
                  class="cursor-pointer"
                  isActive={isNavigationActive(item.path)}
                  aria-current={isNavigationActive(item.path) ? 'page' : undefined}
                  onclick={() => goTo(item.path)}
                >
                  <item.icon />
                  <span>{item.label}</span>
                </Sidebar.MenuButton>
              </Sidebar.MenuItem>
            {/each}
          </Sidebar.Menu>
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
        </Sidebar.Group>
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
    <div class="drag-region h-full min-w-0 flex-1"></div>

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

  :global(.client-navigation [data-slot='sidebar-menu-button']) {
    height: 38px;
    gap: 12px;
    padding-inline: 12px;
    background: transparent;
    color: inherit;
    font-weight: 400;
    transition: box-shadow 150ms;
  }
  :global(.client-navigation [data-slot='sidebar-menu-button'][data-active='true']) {
    box-shadow: 0 2px 6px color-mix(in srgb, var(--foreground) 12%, transparent);
  }
</style>
