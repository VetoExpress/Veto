<script lang="ts">
  import { procedureMessage, renderProcedureMessage, type ProcedureMessage } from '$lib/components/conference/common/message'
  import { t, getLocale } from '$lib/i18n'
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import {
    ArrowRight,
    Building2,
    CircleAlert,
    CalendarDays,
    LogIn,
    Play,
    Plus,
    Search,
    Users
  } from '@lucide/svelte'

  import type { Conference } from '$lib/classes/types/conference'

  import { Badge } from '$lib/components/ui/badge'
  import * as Alert from '$lib/components/ui/alert'
  import { Button } from '$lib/components/ui/button'
  import * as Card from '$lib/components/ui/card'
  import * as Empty from '$lib/components/ui/empty'
  import * as InputGroup from '$lib/components/ui/input-group'
  import { ScrollArea } from '$lib/components/ui/scroll-area'
  import ConferenceCard from '$lib/components/home/conference-card.svelte'
  import PlatformConferenceCard from '$lib/components/home/platform-conference-card.svelte'
  import { platformConferences, refreshPlatformConferences, watchPlatformConferences } from '$lib/classes/stores/conference/platform-conference-store'
  import { accountStore } from '$lib/classes/stores/app/account-store'
  import CloudPasswordDialog from '$lib/components/conference/join/cloud-password-dialog.svelte'
  import CloudIdentityPickerDialog from '$lib/components/conference/join/cloud-identity-picker-dialog.svelte'
  import TextAnimate from '$lib/components/ui/text-animate.svelte'
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
  const lastOpenedPlatform = $derived(
    !lastOpened ? $platformConferences.conferences.find((conference) => conference.id === $lastOpenedConferenceId) : undefined
  )
  const filteredPlatformConferences = $derived($platformConferences.conferences.filter((conference) =>
    `${conference.name} ${conference.organizer ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())
  ))

  onMount(() => {
    unloadConference()
    return watchPlatformConferences()
  })

  function openCreatePage(): void {
    createConferenceDialogOpen.set(true)
  }

  function formatDate(ts: number): string {
    return new Date(ts).toLocaleString(getLocale(), { dateStyle: 'short', timeStyle: 'short' })
  }

  function resumeConference(): void {
    if (!lastOpened) return
    if (lastOpened.source === 'cloud') {
      void rejoinCloudConference(lastOpened)
      return
    }
    navigateToConference(lastOpened.id)
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
        error instanceof CloudJoinError ? error.message : procedureMessage('procedure_unable_to_rejoin_check_your_connection_and_try_again')
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
        ? procedureMessage('procedure_multiple_identities_for_value_are_saved_on_this_device_choose_a_seat_to_enter', { value1: conference.name })
        : procedureMessage('procedure_multiple_identities_for_value_are_saved_on_this_device_choose_a_seat_whose_saved_passw', { value1: conference.name })
    identityPickerAction = action
    identityPickerOpen = true
  }

  async function rejoinCloudConference(conference: Conference): Promise<void> {
    const memberships = getCloudMembershipsByConferenceId(conference.id)
    if (memberships.length === 0) {
      rejoinError = procedureMessage('procedure_no_saved_cloud_seat_information_was_found_join_again_using_an_invite_code')
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
      rejoinError = procedureMessage('procedure_no_saved_cloud_seat_information_was_found_join_again_using_an_invite_code')
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

<div class="page-shell relative flex h-screen min-h-0 flex-col overflow-hidden bg-background">
  <div class="page-grid pointer-events-none absolute inset-0 opacity-50" aria-hidden="true"></div>
  <div
    class="page-orb page-orb-primary page-orb-primary-compact pointer-events-none"
    aria-hidden="true"
  ></div>

  <header
    class="relative z-10 shrink-0 border-b bg-background/75 px-6 py-6 backdrop-blur-xl sm:px-8 lg:pl-10 lg:pr-2"
  >
    <div class="flex w-full flex-col gap-6">
      <div class="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
        <div class="min-w-0">
          <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">
            <TextAnimate
              text={t('procedure_pick_up_where_you_left_off')}
              className="font-semibold"
              as="span"
              by="word"
              animation="blurInUp"
              startOnView={false}
              once
            />
          </h1>
          <p class="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            <span>{t('procedure_every_conference_deserves_thoughtful_preparation')}</span>
          </p>
        </div>

        <div class="flex shrink-0 gap-2">
          <Button size="lg" variant="outline" onclick={() => joinConferenceDialogOpen.set(true)}>
            <LogIn data-icon="inline-start" />
            {t('procedure_join_conference')}
          </Button>
          <Button size="lg" onclick={openCreatePage}>
            <Plus data-icon="inline-start" />
            {t('procedure_create_conference')}
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      </div>

      <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
        <InputGroup.Root class="max-w-xl flex-1 bg-background/70">
          <InputGroup.Addon>
            <Search />
          </InputGroup.Addon>
          <InputGroup.Input
            bind:value={query}
            placeholder={t('procedure_search_conferences_or_committees')}
            aria-label={t('procedure_search_conferences_or_committees_2')}
          />
        </InputGroup.Root>
        <Badge variant="secondary" class="self-start px-3 py-1 sm:self-auto">
          {t('procedure_conference_search_count', { value1: filteredConferences.length + filteredPlatformConferences.length, value2: $conferences.length + $platformConferences.conferences.length })}
        </Badge>
      </div>
    </div>
  </header>

  <ScrollArea class="relative z-10 min-h-0 flex-1">
    <main class="flex w-full flex-col gap-8 px-6 py-8 sm:px-8 lg:py-10 lg:pl-10 lg:pr-2">
      {#if lastOpened && !query.trim()}
        <section aria-labelledby="continue-heading">
          <div class="mb-3 flex items-end justify-between gap-4">
            <div>
              <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                {t('procedure_recently_opened')}
              </p>
              <h2 id="continue-heading" class="mt-1 text-lg font-semibold tracking-tight">
                {t('procedure_return_to_your_last_conference')}
              </h2>
            </div>
            <Badge variant="outline" class="hidden sm:inline-flex">{t('procedure_quick_access')}</Badge>
          </div>

          <Card.Root
            class="group relative cursor-pointer overflow-hidden border-primary/25 bg-card/80 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg"
            role="link"
            tabindex={0}
            onclick={resumeConference}
            onkeydown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                resumeConference()
              }
            }}
          >
            <div class="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden="true"></div>
            <Card.Content class="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
              <div
                class="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"
              >
                <Play class="size-5" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-xs font-medium uppercase tracking-[0.16em] text-primary">{t('procedure_continue')}</p>
                <p class="mt-1 truncate text-lg font-semibold">{lastOpened.name}</p>
                <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span class="flex items-center gap-1.5">
                    <Building2 class="size-3.5" />
                    {t('procedure_committee_count', { count: lastOpened.committees.length })}
                  </span>
                  <span class="flex items-center gap-1.5">
                    <CalendarDays class="size-3.5" />
                    {formatDate(lastOpened.createdAt)}
                  </span>
                  <span class="flex items-center gap-1.5">
                    <Users class="size-3.5" />
                    {t('procedure_seat_count', { value1: lastOpened.committees.reduce((count, committee) => count + committee.seats.length, 0) })}
                  </span>
                </div>
              </div>
              <Button
                class="shrink-0"
                onclick={(event) => {
                  event.stopPropagation()
                  resumeConference()
                }}
              >
                {t('procedure_open_workspace')}
                <ArrowRight data-icon="inline-end" />
              </Button>
            </Card.Content>
          </Card.Root>
        </section>
      {/if}

      {#if lastOpenedPlatform && !query.trim()}
        <section aria-label={t('procedure_recently_opened')}>
          <p class="mb-3 text-xs font-medium text-muted-foreground">{t('procedure_recently_opened_cloud_conferences')}</p>
          <PlatformConferenceCard conference={lastOpenedPlatform} />
        </section>
      {/if}

      <section aria-labelledby="conference-list-heading">
        <div class="mb-3 flex items-end justify-between gap-4">
          <div>
            <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {t('procedure_your_favorites')}
            </p>
            <h2 id="conference-list-heading" class="mt-1 text-lg font-semibold tracking-tight">
              {t('procedure_all_conferences')}
            </h2>
          </div>
          {#if query.trim()}
            <span class="text-xs text-muted-foreground">{t('procedure_search_results_update_as_you_type')}</span>
          {/if}
        </div>

        {#if rejoinError}
          <Alert.Root variant="destructive" class="mb-3">
            <CircleAlert />
            <Alert.Title>{t('procedure_unable_to_rejoin')}</Alert.Title>
            <Alert.Description>{renderProcedureMessage(rejoinError)}</Alert.Description>
          </Alert.Root>
        {/if}

        {#if $accountStore.user}
          <div class="mb-3 flex items-center justify-between gap-3">
            <p class="text-sm text-muted-foreground">{t('procedure_conferences_created_on_the_cloud_platform_open_on_the_platform')}</p>
            <Button variant="outline" size="sm" disabled={$platformConferences.loading} onclick={() => void refreshPlatformConferences()}>{t('procedure_refresh_cloud_conferences')}</Button>
          </div>
          {#if $platformConferences.loading}<p role="status" class="mb-3 text-sm text-muted-foreground">{t('procedure_loading_cloud_conferences')}</p>{/if}
          {#if $platformConferences.error}<p role="alert" class="mb-3 text-sm text-destructive">{$platformConferences.error}</p>{/if}
        {/if}
        {#if filteredConferences.length === 0 && filteredPlatformConferences.length === 0 && !$platformConferences.loading}
          <Empty.Root class="min-h-64 border bg-card/45 shadow-sm">
            <Empty.Header>
              <Empty.Media variant="icon">
                <Search class="size-4" />
              </Empty.Media>
              <Empty.Title>{t('procedure_no_matching_conferences')}</Empty.Title>
              <Empty.Description>{t('procedure_try_another_keyword_or_clear_the_search')}</Empty.Description>
            </Empty.Header>
            <Empty.Content>
              <Button variant="outline" size="sm" onclick={() => (query = '')}>{t('procedure_clear_search')}</Button>
            </Empty.Content>
          </Empty.Root>
        {:else}
          <div class="flex flex-col gap-3">
            {#each filteredPlatformConferences as conference (conference.id)}
              <PlatformConferenceCard {conference} />
            {/each}
            {#each filteredConferences as conference (conference.id)}
              <ConferenceCard
                {conference}
                onJoin={conference.source === 'cloud' ? rejoinCloudConference : undefined}
                onUpdatePassword={openCloudPasswordDialog}
                onDelete={conference.source === 'cloud' ? removeCloudConference : undefined}
              />
            {/each}
          </div>
        {/if}
      </section>
    </main>
    <div class="h-10"></div>
  </ScrollArea>
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
  .page-shell {
    isolation: isolate;
  }

  .page-grid {
    background-image:
      linear-gradient(
        to right,
        color-mix(in oklch, var(--border) 42%, transparent) 1px,
        transparent 1px
      ),
      linear-gradient(
        to bottom,
        color-mix(in oklch, var(--border) 42%, transparent) 1px,
        transparent 1px
      );
    background-size: 42px 42px;
    mask-image: linear-gradient(to bottom, black, transparent 75%);
  }

  .page-orb {
    position: absolute;
    aspect-ratio: 1;
    border-radius: 9999px;
    filter: blur(72px);
    pointer-events: none;
    opacity: 0.18;
  }

  .page-orb-primary {
    top: -18rem;
    right: -12rem;
    width: min(48rem, 72vw);
    background: color-mix(in oklch, var(--primary) 70%, transparent);
  }

  .page-orb-primary-compact {
    top: -24rem;
    right: -16rem;
    width: min(40rem, 55vw);
    opacity: 0.12;
  }

  @media (prefers-reduced-motion: reduce) {
    .page-orb {
      filter: blur(52px);
    }
  }
</style>
