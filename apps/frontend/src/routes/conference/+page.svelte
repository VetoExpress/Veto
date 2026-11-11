<script lang="ts">
  import {
    procedureMessage,
    renderProcedureMessage,
    type ProcedureMessage
  } from '$lib/components/conference/common/message'
  import { t, formatNumber } from '$lib/i18n'
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import {
    ArrowRight,
    CircleAlert,
    HardDrive,
    LogIn,
    Play,
    Plus,
    Search,
    Workflow
  } from '@lucide/svelte'
  import type { Conference } from '$lib/classes/types/conference'
  import * as Alert from '$lib/components/ui/alert'
  import { Button } from '$lib/components/ui/button'
  import * as Empty from '$lib/components/ui/empty'
  import * as InputGroup from '$lib/components/ui/input-group'
  import AppPage from '$lib/components/page-shell/app-page.svelte'
  import AppPageHeader from '$lib/components/page-shell/app-page-header.svelte'
  import ConferenceCard from '$lib/components/home/conference-card.svelte'
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
  const lastOpened = $derived(
    $lastOpenedConferenceId
      ? ($conferences.find((conference) => conference.id === $lastOpenedConferenceId) ?? null)
      : null
  )
  const workspaceCount = $derived($conferences.length)

  onMount(() => {
    unloadConference()
  })

  function openCreatePage(): void {
    createConferenceDialogOpen.set(true)
  }
  function resumeConference(): void {
    if (lastOpened) {
      if (lastOpened.source === 'cloud') void rejoinCloudConference(lastOpened)
      else navigateToConference(lastOpened.id)
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

<AppPage class="workspace-page">
  <AppPageHeader title={t('procedure_workspace')} />
  <div class="workspace-overview">
    {#if lastOpened}
      <button
        class="resume-card flex min-w-0 flex-col justify-between gap-4 rounded-2xl p-5 text-left"
        onclick={resumeConference}
      >
        <div class="flex items-center justify-between">
          <span class="resume-badge">
            <span class="status-dot"></span>
            {t('procedure_ready_to_resume')}
          </span>
        </div>
        <div>
          <p class="eyebrow">{t('procedure_last_opened_workspace')}</p>
          <h2 class="mt-2 break-words text-2xl font-semibold leading-tight tracking-tight">
            {lastOpened.name}
          </h2>
          <p class="resume-details mt-3 text-xs leading-relaxed">
            {t('procedure_committee_count', {
              count: lastOpened.committees.length
            })} · {t('procedure_seat_count', {
              value1: lastOpened.committees.reduce(
                (count, committee) => count + committee.seats.length,
                0
              )
            })}
          </p>
        </div>
        <div class="flex items-end justify-between gap-4">
          <div class="min-w-0 flex-1">
            <p class="resume-details text-xs">{t('procedure_recently_opened')}</p>
          </div>
          <span class="resume-button">
            <Play class="size-3.5" />{t('procedure_open_workspace')}
          </span>
        </div>
      </button>
    {:else}
      <div class="empty-resume-card flex min-w-0 flex-col justify-between gap-4 rounded-2xl p-5">
        <div
          class="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground"
        >
          <HardDrive class="size-5" />
        </div>
        <div>
          <p class="eyebrow">{t('procedure_last_opened_workspace')}</p>
          <h2 class="mt-2 text-2xl font-semibold tracking-tight">
            {t('procedure_no_workspace_open')}
          </h2>
          <p class="mt-2 text-xs text-muted-foreground">
            {t('procedure_create_or_join_to_begin')}
          </p>
        </div>
        <span class="text-xs font-semibold text-muted-foreground">
          {t('procedure_get_moving')}
          <ArrowRight class="ml-1 inline size-3.5" />
        </span>
      </div>
    {/if}
    <div class="flex min-w-0 flex-col gap-3">
      <section class="surface-card rounded-2xl p-4" aria-labelledby="quick-actions-heading">
        <div class="mb-2 flex items-center justify-between">
          <div>
            <p class="eyebrow">{t('procedure_get_moving')}</p>
            <h2 id="quick-actions-heading" class="mt-1 text-[15px] font-bold">
              {t('procedure_quick_actions')}
            </h2>
          </div>
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
        class="tip-card flex flex-1 flex-col justify-between gap-2 rounded-2xl p-4"
        aria-labelledby="workflow-tip-heading"
      >
        <div class="flex items-center justify-between">
          <span class="eyebrow">
            {t('procedure_workflow_tip')}
          </span>
        </div>
        <div>
          <h2 id="workflow-tip-heading" class="text-[15px] font-semibold text-foreground">
            {t('procedure_keep_every_room_in_sync')}
          </h2>
          <p class="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t('procedure_display_window_tip')}
          </p>
        </div>
        <span class="text-xs font-semibold text-muted-foreground">
          {t('procedure_open_display_window')}
          <ArrowRight class="ml-1 inline size-3.5" />
        </span>
      </section>
    </div>
  </div>

  <section class="flex min-w-0 flex-1 flex-col gap-4" aria-labelledby="conference-list-heading">
    <div class="flex items-end justify-between gap-4">
      <div>
        <p class="eyebrow">{t('procedure_your_workspace')}</p>
        <h2 id="conference-list-heading" class="mt-1 text-[22px] font-bold tracking-tight">
          {t('procedure_all_conferences')}
        </h2>
      </div>
      <span class="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
        {formatNumber(workspaceCount)}
        {t('procedure_workspaces')}
      </span>
    </div>
    <InputGroup.Root class="search-field h-11 bg-card">
      <InputGroup.Addon><Search /></InputGroup.Addon><InputGroup.Input
        bind:value={query}
        placeholder={t('procedure_search_conferences_or_committees')}
        aria-label={t('procedure_search_conferences_or_committees_2')}
      />
    </InputGroup.Root>
    {#if rejoinError}<Alert.Root variant="destructive">
        <CircleAlert /><Alert.Title>
          {t('procedure_unable_to_rejoin')}
        </Alert.Title><Alert.Description>
          {renderProcedureMessage(rejoinError)}
        </Alert.Description>
      </Alert.Root>{/if}
    {#if filteredConferences.length === 0}<Empty.Root
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
        {#each filteredConferences as conference (conference.id)}<ConferenceCard
            {conference}
            onJoin={conference.source === 'cloud' ? rejoinCloudConference : undefined}
            onUpdatePassword={openCloudPasswordDialog}
            onDelete={conference.source === 'cloud' ? removeCloudConference : undefined}
          />{/each}
        <button class="create-placeholder" onclick={openCreatePage}>
          <span
            class="flex size-6 items-center justify-center rounded-lg bg-muted text-muted-foreground"
          >
            <Plus class="size-3.5" />
          </span>
          {t('procedure_create_another_conference')}
        </button>
      </div>{/if}
  </section>
</AppPage>
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

<style>
  .workspace-overview {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1rem;
  }
  @media (min-width: 768px) {
    .workspace-overview {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }
  }
  .resume-card {
    min-height: 16rem;
    background: var(--primary);
    color: var(--primary-foreground);
    transition: opacity 150ms ease;
  }
  .resume-card:hover {
    opacity: 0.92;
  }
  .resume-card:focus-visible,
  .quick-action:focus-visible,
  .create-placeholder:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 3px;
  }
  .resume-details {
    opacity: 0.65;
  }
  .resume-card .eyebrow {
    color: inherit;
    opacity: 0.65;
  }
  .empty-resume-card,
  .surface-card {
    border: 1px solid var(--border);
    background: var(--card);
  }
  .empty-resume-card {
    min-height: 16rem;
  }
  .resume-badge {
    display: inline-flex;
    width: fit-content;
    align-items: center;
    gap: 0.45rem;
    border-radius: 0.4rem;
    background: color-mix(in oklch, currentColor 10%, transparent);
    padding: 0.35rem 0.55rem;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: currentColor;
  }
  .resume-button {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    border-radius: 0.55rem;
    background: var(--primary-foreground);
    padding: 0.6rem 0.8rem;
    color: var(--primary);
    font-size: 11px;
    font-weight: 600;
  }
  .eyebrow {
    color: var(--muted-foreground);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .quick-action {
    display: flex;
    min-height: 50px;
    align-items: center;
    gap: 0.6rem;
    border-radius: 0.65rem;
    background: var(--muted);
    padding: 0.65rem;
    text-align: left;
    transition: background-color 150ms ease;
  }
  .quick-action:hover {
    background: var(--accent);
  }
  .quick-action-primary {
    background: var(--primary);
    color: var(--primary-foreground);
  }
  .quick-action-primary:hover {
    background: color-mix(in oklch, var(--primary) 88%, var(--background));
  }
  .quick-action-icon {
    display: flex;
    height: 29px;
    width: 29px;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border-radius: 0.5rem;
    background: var(--background);
    color: var(--muted-foreground);
  }
  .quick-action-primary .quick-action-icon {
    background: color-mix(in oklch, var(--primary-foreground) 15%, transparent);
    color: inherit;
  }
  .quick-action strong,
  .quick-action small {
    display: block;
  }
  .quick-action strong {
    color: var(--foreground);
    font-size: 11px;
    font-weight: 600;
  }
  .quick-action-primary strong {
    color: inherit;
  }
  .quick-action small {
    margin-top: 3px;
    color: var(--muted-foreground);
    font-size: 9px;
  }
  .tip-card {
    border: 1px solid var(--border);
    background: var(--muted);
  }
  .quick-action-primary small {
    color: inherit;
    opacity: 0.65;
  }
  .tip-icon {
    display: flex;
    height: 24px;
    width: 24px;
    align-items: center;
    justify-content: center;
    border-radius: 0.55rem;
    background: var(--background);
    color: var(--muted-foreground);
  }
  :global(.search-field) {
    border-color: var(--border);
    box-shadow: none;
  }
  .create-placeholder {
    display: flex;
    min-height: 70px;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    border: 1px dashed var(--border);
    border-radius: 0.85rem;
    color: var(--muted-foreground);
    font-size: 11px;
  }
  .create-placeholder:hover {
    border-color: var(--ring);
    background: var(--muted);
  }
</style>
