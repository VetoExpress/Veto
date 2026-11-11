<script lang="ts">
  import {
    procedureMessage,
    renderProcedureMessage,
    type ProcedureMessage
  } from '$lib/components/conference/common/message'
  import { t, getLocale } from '$lib/i18n'
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import {
    Activity,
    ArrowRight,
    Bell,
    Check,
    CircleAlert,
    CircleHelp,
    Cloud,
    HardDrive,
    Layers3,
    LayoutDashboard,
    LogIn,
    Monitor,
    MoreHorizontal,
    Play,
    Plus,
    Search,
    Timer,
    Users,
    Workflow
  } from '@lucide/svelte'
  import type { Conference } from '$lib/classes/types/conference'
  import * as Alert from '$lib/components/ui/alert'
  import { Badge } from '$lib/components/ui/badge'
  import { Button } from '$lib/components/ui/button'
  import * as Empty from '$lib/components/ui/empty'
  import * as InputGroup from '$lib/components/ui/input-group'
  import { ScrollArea } from '$lib/components/ui/scroll-area'
  import ConferenceCard from '$lib/components/home/conference-card.svelte'
  import PlatformConferenceCard from '$lib/components/home/platform-conference-card.svelte'
  import {
    platformConferences,
    refreshPlatformConferences,
    watchPlatformConferences
  } from '$lib/classes/stores/conference/platform-conference-store'
  import { accountStore } from '$lib/classes/stores/app/account-store'
  import CloudPasswordDialog from '$lib/components/conference/join/cloud-password-dialog.svelte'
  import CloudIdentityPickerDialog from '$lib/components/conference/join/cloud-identity-picker-dialog.svelte'
  import {
    conferences,
    deleteConference,
    lastOpenedConferenceId,
    unloadConference
  } from '$lib/classes/stores/conference/conference-store'
  import {
    createConferenceDialogOpen,
    joinConferenceDialogOpen
  } from '$lib/classes/stores/app/global-ui-store'
  import { navigateToConference } from '$lib/classes/utils'
  import { authenticateCloudSeat, CloudJoinError } from '$lib/classes/clients/cloud-join-client'
  import {
    getCloudMembershipsByConferenceId,
    getCloudMembershipPassword,
    rememberCloudMembership,
    removeCloudMembership,
    type CloudMembership
  } from '$lib/classes/stores/conference/cloud-membership-store'
  import { cloudSession } from '$lib/classes/stores/cloud/cloud-session-store.svelte'

  let query = $state('')
  let passwordDialogOpen = $state(false)
  let passwordMembership = $state<CloudMembership | null>(null)
  let rejoinError = $state<ProcedureMessage>('')
  let identityPickerOpen = $state(false)
  let identityPickerMemberships = $state<CloudMembership[]>([])
  let identityPickerDescription = $state<ProcedureMessage>('')
  let identityPickerAction = $state<'rejoin' | 'password'>('rejoin')

  const filteredConferences = $derived(
    query.trim()
      ? $conferences.filter(
          (conference) =>
            conference.name.toLowerCase().includes(query.trim().toLowerCase()) ||
            conference.committees.some((committee) =>
              committee.name.toLowerCase().includes(query.trim().toLowerCase())
            )
        )
      : $conferences
  )
  const filteredPlatformConferences = $derived(
    $platformConferences.conferences.filter((conference) =>
      `${conference.name} ${conference.organizer ?? ''}`
        .toLowerCase()
        .includes(query.trim().toLowerCase())
    )
  )
  const lastOpened = $derived(
    $lastOpenedConferenceId
      ? ($conferences.find((conference) => conference.id === $lastOpenedConferenceId) ?? null)
      : null
  )
  const lastOpenedPlatform = $derived(
    !lastOpened
      ? $platformConferences.conferences.find(
          (conference) => conference.id === $lastOpenedConferenceId
        )
      : undefined
  )
  const workspaceCount = $derived($conferences.length + $platformConferences.conferences.length)
  const committeeCount = $derived(
    $conferences.reduce((count, conference) => count + conference.committees.length, 0) +
      $platformConferences.conferences.reduce(
        (count, conference) => count + (conference.committeeCount ?? 0),
        0
      )
  )
  const seatCount = $derived(
    $conferences.reduce(
      (count, conference) =>
        count +
        conference.committees.reduce(
          (committeeCount, committee) => committeeCount + committee.seats.length,
          0
        ),
      0
    ) +
      $platformConferences.conferences.reduce(
        (count, conference) => count + (conference.seatCount ?? 0),
        0
      )
  )

  onMount(() => {
    unloadConference()
    return watchPlatformConferences()
  })

  function openCreatePage(): void {
    createConferenceDialogOpen.set(true)
  }
  function formatDate(ts: number | string): string {
    return new Date(ts).toLocaleString(getLocale(), { dateStyle: 'short', timeStyle: 'short' })
  }
  function resumeConference(): void {
    if (lastOpened) {
      if (lastOpened.source === 'cloud') void rejoinCloudConference(lastOpened)
      else navigateToConference(lastOpened.id)
    } else if (lastOpenedPlatform) {
      window.location.replace(`/conference/${lastOpenedPlatform.id}`)
    }
  }
  async function rejoinWithMembership(membership: CloudMembership): Promise<void> {
    rejoinError = ''
    try {
      const password = await getCloudMembershipPassword(membership)
      const result = await authenticateCloudSeat({
        inviteCode: membership.inviteCode,
        password: password ?? undefined
      })
      await rememberCloudMembership(result, password ?? undefined)
      cloudSession.setResult(result)
      goto(resolve(`/client/${result.conferenceId}/committee/${result.committeeId}`))
    } catch (error) {
      if (error instanceof CloudJoinError && error.status === 401) {
        passwordMembership = membership
        passwordDialogOpen = true
        return
      }
      rejoinError =
        error instanceof CloudJoinError
          ? error.message
          : procedureMessage('procedure_unable_to_rejoin_check_your_connection_and_try_again')
    }
  }
  function openIdentityPicker(
    conference: Conference,
    memberships: CloudMembership[],
    action: 'rejoin' | 'password'
  ): void {
    identityPickerMemberships = memberships
    identityPickerDescription =
      action === 'rejoin'
        ? procedureMessage(
            'procedure_multiple_identities_for_value_are_saved_on_this_device_choose_a_seat_to_enter',
            { value1: conference.name }
          )
        : procedureMessage(
            'procedure_multiple_identities_for_value_are_saved_on_this_device_choose_a_seat_whose_saved_passw',
            { value1: conference.name }
          )
    identityPickerAction = action
    identityPickerOpen = true
  }
  async function rejoinCloudConference(conference: Conference): Promise<void> {
    const memberships = getCloudMembershipsByConferenceId(conference.id)
    if (memberships.length === 0) {
      rejoinError = procedureMessage(
        'procedure_no_saved_cloud_seat_information_was_found_join_again_using_an_invite_code'
      )
      return
    }
    rejoinError = ''
    if (memberships.length > 1) {
      openIdentityPicker(conference, memberships, 'rejoin')
      return
    }
    await rejoinWithMembership(memberships[0])
  }
  function handleIdentitySelect(membership: CloudMembership): void {
    if (identityPickerAction === 'password') {
      rejoinError = ''
      passwordMembership = membership
      passwordDialogOpen = true
      return
    }
    void rejoinWithMembership(membership)
  }
  function openCloudPasswordDialog(conference: Conference): void {
    const memberships = getCloudMembershipsByConferenceId(conference.id)
    if (memberships.length === 0) {
      rejoinError = procedureMessage(
        'procedure_no_saved_cloud_seat_information_was_found_join_again_using_an_invite_code'
      )
      return
    }
    rejoinError = ''
    if (memberships.length > 1) {
      openIdentityPicker(conference, memberships, 'password')
      return
    }
    passwordMembership = memberships[0]
    passwordDialogOpen = true
  }
  function removeCloudConference(conference: Conference): void {
    removeCloudMembership(conference.id)
    deleteConference(conference.id)
  }
</script>

<div class="workspace-shell flex h-full min-h-0 flex-col overflow-hidden">
  <ScrollArea class="min-h-0 flex-1">
    <main
      class="workspace-grid mx-auto flex w-full max-w-[1560px] flex-col gap-5 p-5 md:flex-row lg:p-7"
    >
      <section
        class="flex min-w-0 flex-col gap-4 md:w-[clamp(245px,28vw,370px)] md:shrink-0"
        aria-labelledby="quick-actions-heading"
      >
        {#if (lastOpened || lastOpenedPlatform) && !query.trim()}
          <button
            class="resume-card group flex min-h-[286px] flex-col justify-between rounded-2xl p-6 text-left shadow-lg"
            onclick={resumeConference}
          >
            <div class="flex items-center justify-between">
              <span class="resume-badge">
                <span class="status-dot"></span>
                {t('procedure_ready_to_resume')}
              </span>
              <MoreHorizontal class="size-[18px] text-slate-500" />
            </div>
            <div>
              <p class="eyebrow text-indigo-200/70">{t('procedure_last_opened_workspace')}</p>
              <h1 class="mt-2 text-[25px] font-bold leading-[1.08] tracking-tight text-white">
                {lastOpened?.name ?? lastOpenedPlatform?.name}
              </h1>
              <p class="mt-3 text-xs leading-relaxed text-slate-300">
                {#if lastOpened}{t('procedure_committee_count', {
                    count: lastOpened.committees.length
                  })} · {t('procedure_seat_count', {
                    value1: lastOpened.committees.reduce(
                      (count, committee) => count + committee.seats.length,
                      0
                    )
                  })}{:else}{t('settings_cloud_platform')} · {lastOpenedPlatform?.organizer ??
                    t('procedure_conference')}{/if}
              </p>
            </div>
            <div class="flex items-end justify-between gap-4">
              <div class="min-w-0 flex-1">
                <p class="mb-2 text-[10px] text-slate-400">{t('procedure_recently_opened')}</p>
                <div class="h-1.5 max-w-[150px] rounded-full bg-slate-700">
                  <div class="h-1.5 w-2/3 rounded-full bg-indigo-400"></div>
                </div>
              </div>
              <span class="resume-button">
                <Play class="size-3.5" />{t('procedure_open_workspace')}
              </span>
            </div>
          </button>
        {:else}
          <div
            class="empty-resume-card flex min-h-[286px] flex-col justify-between rounded-2xl p-6"
          >
            <div
              class="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800"
            >
              <HardDrive class="size-5" />
            </div>
            <div>
              <p class="eyebrow">{t('procedure_last_opened_workspace')}</p>
              <h1 class="mt-2 text-2xl font-bold tracking-tight">
                {t('procedure_no_workspace_open')}
              </h1>
              <p class="mt-2 text-xs text-muted-foreground">
                {t('procedure_create_or_join_to_begin')}
              </p>
            </div>
            <span class="text-xs font-semibold text-indigo-600 dark:text-indigo-300">
              {t('procedure_get_moving')}
              <ArrowRight class="ml-1 inline size-3.5" />
            </span>
          </div>
        {/if}
        <section class="surface-card rounded-2xl p-5" aria-labelledby="quick-actions-heading">
          <div class="mb-4 flex items-center justify-between">
            <div>
              <p class="eyebrow">{t('procedure_get_moving')}</p>
              <h2 id="quick-actions-heading" class="mt-1 text-[15px] font-bold">
                {t('procedure_quick_actions')}
              </h2>
            </div>
            <Workflow class="size-4 text-slate-400" />
          </div>
          <div class="grid grid-cols-2 gap-2">
            <button class="quick-action quick-action-primary" onclick={openCreatePage}>
              <span class="quick-action-icon"><Plus class="size-4" /></span>
              <span>
                <strong>{t('procedure_create_conference')}</strong>
                <small>{t('procedure_start_from_scratch')}</small>
              </span>
            </button>
            <button class="quick-action" onclick={() => joinConferenceDialogOpen.set(true)}>
              <span class="quick-action-icon"><LogIn class="size-4" /></span>
              <span>
                <strong>{t('procedure_join_conference')}</strong>
                <small>{t('procedure_use_invite_code')}</small>
              </span>
            </button>
          </div>
        </section>
        <section
          class="tip-card flex min-h-[210px] flex-col justify-between rounded-2xl p-5"
          aria-labelledby="workflow-tip-heading"
        >
          <div class="flex items-center justify-between">
            <span class="tip-icon"><Workflow class="size-4" /></span>
            <span class="eyebrow text-teal-600/80 dark:text-teal-300/80">
              {t('procedure_workflow_tip')}
            </span>
          </div>
          <div>
            <h2
              id="workflow-tip-heading"
              class="text-[15px] font-bold text-teal-900 dark:text-teal-100"
            >
              {t('procedure_keep_every_room_in_sync')}
            </h2>
            <p class="mt-2 text-[11px] leading-relaxed text-teal-800/70 dark:text-teal-100/70">
              {t('procedure_display_window_tip')}
            </p>
          </div>
          <span class="text-[11px] font-semibold text-teal-700 dark:text-teal-200">
            {t('procedure_open_display_window')}
            <ArrowRight class="ml-1 inline size-3.5" />
          </span>
        </section>
      </section>

      <section class="flex min-w-0 flex-1 flex-col gap-4" aria-labelledby="conference-list-heading">
        <div class="flex items-end justify-between gap-4">
          <div>
            <p class="eyebrow">{t('procedure_your_workspace')}</p>
            <h2 id="conference-list-heading" class="mt-1 text-[22px] font-bold tracking-tight">
              {t('procedure_all_conferences')}
            </h2>
          </div>
          <span class="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
            <span class="size-1.5 rounded-full bg-indigo-500"></span>
            {workspaceCount}
            {t('procedure_workspaces')}
          </span>
        </div>
        <InputGroup.Root class="search-field h-11 bg-card">
          <InputGroup.Addon><Search /></InputGroup.Addon><InputGroup.Input
            bind:value={query}
            placeholder={t('procedure_search_conferences_or_committees')}
            aria-label={t('procedure_search_conferences_or_committees_2')}
          /><InputGroup.Addon align="inline-end" class="hidden sm:flex">
            <span class="shortcut-hint">⌘ F</span>
          </InputGroup.Addon>
        </InputGroup.Root>
        {#if rejoinError}<Alert.Root variant="destructive">
            <CircleAlert /><Alert.Title>
              {t('procedure_unable_to_rejoin')}
            </Alert.Title><Alert.Description>
              {renderProcedureMessage(rejoinError)}
            </Alert.Description>
          </Alert.Root>{/if}
        {#if $accountStore.user}<div
            class="flex items-center justify-between gap-3 text-xs text-muted-foreground"
          >
            <span>
              {t('procedure_conferences_created_on_the_cloud_platform_open_on_the_platform')}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={$platformConferences.loading}
              onclick={() => void refreshPlatformConferences()}
            >
              {t('settings_refresh')}
            </Button>
          </div>{/if}
        {#if $platformConferences.loading}<p role="status" class="text-xs text-muted-foreground">
            {t('procedure_loading_cloud_conferences')}
          </p>{/if}
        {#if $platformConferences.error}<p role="alert" class="text-xs text-destructive">
            {$platformConferences.error}
          </p>{/if}
        {#if filteredConferences.length === 0 && filteredPlatformConferences.length === 0 && !$platformConferences.loading}<Empty.Root
            class="min-h-64 border bg-card/60 shadow-none"
          >
            <Empty.Header>
              <Empty.Media variant="icon"><Search class="size-4" /></Empty.Media><Empty.Title>
                {t('procedure_no_matching_conferences')}
              </Empty.Title><Empty.Description>
                {t('procedure_try_another_keyword_or_clear_the_search')}
              </Empty.Description>
            </Empty.Header><Empty.Content>
              <Button variant="outline" size="sm" onclick={() => (query = '')}>
                {t('procedure_clear_search')}
              </Button>
            </Empty.Content>
          </Empty.Root>{:else}<div class="flex min-w-0 flex-col gap-2.5">
            {#each filteredPlatformConferences as conference (conference.id)}<PlatformConferenceCard
                {conference}
              />{/each}{#each filteredConferences as conference (conference.id)}<ConferenceCard
                {conference}
                onJoin={conference.source === 'cloud' ? rejoinCloudConference : undefined}
                onUpdatePassword={openCloudPasswordDialog}
                onDelete={conference.source === 'cloud' ? removeCloudConference : undefined}
              />{/each}
            <button class="create-placeholder" onclick={openCreatePage}>
              <span
                class="flex size-6 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800"
              >
                <Plus class="size-3.5" />
              </span>
              {t('procedure_create_another_conference')}
            </button>
          </div>{/if}
      </section>
    </main>
  </ScrollArea>
  <footer
    class="status-bar flex h-[30px] shrink-0 items-center justify-between border-t px-6 text-[10px] text-muted-foreground lg:px-8"
  >
    <span class="flex items-center gap-2">
      <span class="size-1.5 rounded-full bg-emerald-400"></span>
      {t('procedure_local_workspace_ready')}
      <span class="text-border">|</span>
      Veto v0.151.2
    </span>
    <span>{t('procedure_need_help')}</span>
  </footer>
  <CloudPasswordDialog
    open={passwordDialogOpen}
    membership={passwordMembership}
    onOpenChange={(value) => (passwordDialogOpen = value)}
  />
  <CloudIdentityPickerDialog
    open={identityPickerOpen}
    memberships={identityPickerMemberships}
    description={renderProcedureMessage(identityPickerDescription)}
    onSelect={handleIdentitySelect}
    onOpenChange={(value) => (identityPickerOpen = value)}
  />
</div>

<style>
  .workspace-shell {
    background: #f4f6fa;
    color: #202a3a;
  }
  :global(.dark) .workspace-shell {
    background: #111827;
    color: #f8fafc;
  }

  .workspace-grid {
    min-height: calc(100% - 1px);
  }
  .resume-card {
    background: #18243a;
    transition:
      transform 0.15s,
      box-shadow 0.15s;
  }
  .resume-card:hover {
    transform: translateY(-1px);
    box-shadow: 0 16px 32px #17203335;
  }
  .empty-resume-card,
  .surface-card {
    border: 1px solid #e3e7ef;
    background: #fff;
    box-shadow: 0 4px 14px #17203308;
  }
  :global(.dark) .empty-resume-card,
  :global(.dark) .surface-card {
    border-color: #293548;
    background: #1b2537;
  }
  .resume-badge {
    display: inline-flex;
    width: fit-content;
    align-items: center;
    gap: 0.45rem;
    border-radius: 0.4rem;
    background: #253452;
    padding: 0.35rem 0.55rem;
    color: #bbd7cb;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: #62d2a2;
  }
  .resume-button {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    border-radius: 0.55rem;
    background: #6d7cff;
    padding: 0.6rem 0.8rem;
    color: white;
    font-size: 11px;
    font-weight: 600;
  }
  .eyebrow {
    color: #98a2b3;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .quick-action {
    display: flex;
    min-height: 62px;
    align-items: center;
    gap: 0.6rem;
    border-radius: 0.65rem;
    background: #f4f7fa;
    padding: 0.65rem;
    text-align: left;
    transition:
      background 0.15s,
      transform 0.15s;
  }
  .quick-action:hover {
    background: #edf1f6;
    transform: translateY(-1px);
  }
  .quick-action-primary {
    background: #eef0ff;
  }
  .quick-action-primary:hover {
    background: #e6e9ff;
  }
  .quick-action-icon {
    display: flex;
    height: 29px;
    width: 29px;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border-radius: 0.5rem;
    background: #e6ebf2;
    color: #607087;
  }
  .quick-action-primary .quick-action-icon {
    background: #dadfff;
    color: #5362e8;
  }
  .quick-action strong,
  .quick-action small {
    display: block;
  }
  .quick-action strong {
    color: #3a4658;
    font-size: 11px;
    font-weight: 600;
  }
  .quick-action-primary strong {
    color: #3e4bb8;
  }
  .quick-action small {
    margin-top: 3px;
    color: #8793a4;
    font-size: 9px;
  }
  .tip-card {
    border: 1px solid #d5eee8;
    background: #e9f7f4;
  }
  :global(.dark) .tip-card {
    border-color: #24534f;
    background: #153b3a;
  }
  .tip-icon {
    display: flex;
    height: 30px;
    width: 30px;
    align-items: center;
    justify-content: center;
    border-radius: 0.55rem;
    background: #cdeee6;
    color: #249d8d;
  }
  :global(.search-field) {
    border-color: #dde3ec;
    box-shadow: none;
  }
  :global(.dark) :global(.search-field) {
    border-color: #334155;
  }
  .shortcut-hint {
    border-radius: 0.3rem;
    background: #f2f4f7;
    padding: 0.2rem 0.35rem;
    color: #8793a4;
    font-size: 10px;
  }
  .create-placeholder {
    display: flex;
    min-height: 70px;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    border: 1px dashed #d8dee8;
    border-radius: 0.85rem;
    color: #7e8a9c;
    font-size: 11px;
  }
  .create-placeholder:hover {
    border-color: #9ca8bb;
    background: #fafbfc;
  }
  .stat-tile {
    display: flex;
    min-height: 76px;
    flex-direction: column;
    justify-content: space-between;
    border-radius: 0.65rem;
    padding: 0.7rem;
  }
  .stat-tile strong {
    font-size: 22px;
    line-height: 1;
  }
  .stat-tile span {
    font-size: 10px;
  }
  .stat-tile-indigo {
    background: #f5f6ff;
    color: #5261e4;
  }
  .stat-tile-indigo span {
    color: #7f89a7;
  }
  .stat-tile-teal {
    background: #f3fbf9;
    color: #279a87;
  }
  .stat-tile-teal span {
    color: #6f958e;
  }
  .stat-tile-amber {
    background: #fff8ee;
    color: #c37b20;
  }
  .stat-tile-amber span {
    color: #9f8969;
  }
  :global(.status-ready) {
    border: 0;
    background: #e8f7f3;
    color: #279a87;
    font-size: 9px;
  }
  .connection-row {
    display: flex;
    align-items: center;
    gap: 0.65rem;
  }
  .connection-row > span:nth-child(2) {
    min-width: 0;
  }
  .connection-row strong,
  .connection-row small {
    display: block;
  }
  .connection-row strong {
    color: #445166;
    font-size: 11px;
    font-weight: 600;
  }
  .connection-row small {
    margin-top: 3px;
    max-width: 190px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #9aa5b5;
    font-size: 10px;
  }
  :global(.dark) .connection-row strong {
    color: #d9e1ee;
  }
  .connection-icon {
    display: flex;
    height: 24px;
    width: 24px;
    align-items: center;
    justify-content: center;
    border-radius: 0.5rem;
  }
  .connection-icon-local {
    background: #eef1f5;
    color: #607087;
  }
  .connection-icon-cloud {
    background: #e8f7f3;
    color: #279a87;
  }
</style>
