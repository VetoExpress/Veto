<script lang="ts">
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
  let rejoinError = $state('')
  let identityPickerOpen = $state(false)
  let identityPickerMemberships = $state<CloudMembership[]>([])
  let identityPickerDescription = $state('')
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
    return new Date(ts).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })
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
        error instanceof CloudJoinError ? error.message : '无法重新入会，请检查网络后重试'
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
        ? `「${conference.name}」在本机保存了多个身份，请选择本次进入的席位。`
        : `「${conference.name}」在本机保存了多个身份，请选择要修改入会密码的席位。`
    identityPickerAction = action
    identityPickerOpen = true
  }

  async function rejoinCloudConference(conference: Conference): Promise<void> {
    const memberships = getCloudMembershipsByConferenceId(conference.id)
    if (memberships.length === 0) {
      rejoinError = '未找到本机保存的云端席位信息，请通过邀请码重新加入。'
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
      rejoinError = '未找到本机保存的云端席位信息，请通过邀请码重新加入。'
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
    class="relative z-10 shrink-0 border-b bg-background/75 px-6 py-6 backdrop-blur-xl sm:px-8 lg:px-10"
  >
    <div class="mx-auto flex max-w-6xl flex-col gap-6">
      <div class="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
        <div class="min-w-0">
          <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">
            <TextAnimate
              text="继续你的会议节奏"
              className="font-semibold"
              as="span"
              by="word"
              animation="blurInUp"
              startOnView={false}
              once
            />
          </h1>
          <p class="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            <span>每一场大会, 都值得悉心准备</span>
          </p>
        </div>

        <div class="flex shrink-0 gap-2">
          <Button size="lg" variant="outline" onclick={() => joinConferenceDialogOpen.set(true)}>
            <LogIn data-icon="inline-start" />
            加入大会
          </Button>
          <Button size="lg" onclick={openCreatePage}>
            <Plus data-icon="inline-start" />
            创建大会
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
            placeholder="搜索大会或委员会..."
            aria-label="搜索大会或委员会"
          />
        </InputGroup.Root>
        <Badge variant="secondary" class="self-start px-3 py-1 sm:self-auto">
          {filteredConferences.length + filteredPlatformConferences.length} / {$conferences.length + $platformConferences.conferences.length} 场大会
        </Badge>
      </div>
    </div>
  </header>

  <ScrollArea class="relative z-10 min-h-0 flex-1">
    <main class="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8 sm:px-8 lg:px-10 lg:py-10">
      {#if lastOpened && !query.trim()}
        <section aria-labelledby="continue-heading">
          <div class="mb-3 flex items-end justify-between gap-4">
            <div>
              <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                最近打开
              </p>
              <h2 id="continue-heading" class="mt-1 text-lg font-semibold tracking-tight">
                回到上次的现场
              </h2>
            </div>
            <Badge variant="outline" class="hidden sm:inline-flex">快速进入</Badge>
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
                <p class="text-xs font-medium uppercase tracking-[0.16em] text-primary">继续上次</p>
                <p class="mt-1 truncate text-lg font-semibold">{lastOpened.name}</p>
                <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span class="flex items-center gap-1.5">
                    <Building2 class="size-3.5" />
                    {lastOpened.committees.length} 个会场
                  </span>
                  <span class="flex items-center gap-1.5">
                    <CalendarDays class="size-3.5" />
                    {formatDate(lastOpened.createdAt)}
                  </span>
                  <span class="flex items-center gap-1.5">
                    <Users class="size-3.5" />
                    {lastOpened.committees.reduce(
                      (count, committee) => count + committee.seats.length,
                      0
                    )} 个席位
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
                进入工作台
                <ArrowRight data-icon="inline-end" />
              </Button>
            </Card.Content>
          </Card.Root>
        </section>
      {/if}

      {#if lastOpenedPlatform && !query.trim()}
        <section aria-label="最近打开">
          <p class="mb-3 text-xs font-medium text-muted-foreground">最近打开 · 云平台大会</p>
          <PlatformConferenceCard conference={lastOpenedPlatform} />
        </section>
      {/if}

      <section aria-labelledby="conference-list-heading">
        <div class="mb-3 flex items-end justify-between gap-4">
          <div>
            <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              你的收藏
            </p>
            <h2 id="conference-list-heading" class="mt-1 text-lg font-semibold tracking-tight">
              所有大会
            </h2>
          </div>
          {#if query.trim()}
            <span class="text-xs text-muted-foreground">搜索结果已实时更新</span>
          {/if}
        </div>

        {#if rejoinError}
          <Alert.Root variant="destructive" class="mb-3">
            <CircleAlert />
            <Alert.Title>无法重新入会</Alert.Title>
            <Alert.Description>{rejoinError}</Alert.Description>
          </Alert.Root>
        {/if}

        {#if $accountStore.user}
          <div class="mb-3 flex items-center justify-between gap-3">
            <p class="text-sm text-muted-foreground">云平台创建的大会会在平台中打开。</p>
            <Button variant="outline" size="sm" disabled={$platformConferences.loading} onclick={() => void refreshPlatformConferences()}>刷新云平台大会</Button>
          </div>
          {#if $platformConferences.loading}<p role="status" class="mb-3 text-sm text-muted-foreground">正在加载云平台大会…</p>{/if}
          {#if $platformConferences.error}<p role="alert" class="mb-3 text-sm text-destructive">{$platformConferences.error}</p>{/if}
        {/if}
        {#if filteredConferences.length === 0 && filteredPlatformConferences.length === 0 && !$platformConferences.loading}
          <Empty.Root class="min-h-64 border bg-card/45 shadow-sm">
            <Empty.Header>
              <Empty.Media variant="icon">
                <Search class="size-4" />
              </Empty.Media>
              <Empty.Title>未找到匹配的大会</Empty.Title>
              <Empty.Description>试试其他关键词，或者清空搜索重新浏览。</Empty.Description>
            </Empty.Header>
            <Empty.Content>
              <Button variant="outline" size="sm" onclick={() => (query = '')}>清空搜索</Button>
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
    description={identityPickerDescription}
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
