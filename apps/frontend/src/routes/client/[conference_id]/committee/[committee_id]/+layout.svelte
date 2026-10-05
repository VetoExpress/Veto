<script lang="ts">
  import { onMount } from 'svelte'
  import {
    Activity,
    ArrowLeft,
    FolderOpen,
    Globe,
    House,
    Monitor,
    Newspaper,
    Plus,
    Puzzle,
    RefreshCw,
    ScrollText,
    Swords,
    UserRoundCheck,
    Users
  } from '@lucide/svelte'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/stores'
  import GlobalSidebar from '$lib/components/global-sidebar.svelte'
  import BrandSwitcher from '$lib/components/app-sidebar/brand-switcher.svelte'
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
    activeSettingsSection,
    createConferenceDialogOpen,
    settingsDialogOpen
  } from '$lib/classes/stores/app/global-ui-store'
  import { isElectron } from '$lib/classes/utils/runtime'
  import { getCloudTimeline, type CloudTimeline } from '$lib/classes/clients/cloud-situation-client'

  let { children } = $props()
  let displayOnlyDialogOpen = $state(false)
  let electronEnvironment = $state(false)

  onMount(() => {
    electronEnvironment = isElectron()
  })

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
  const simpleMajority = $derived(activeCommittee?.getSimpleMajorityThreshold() ?? 0)
  const twoThirds = $derived(activeCommittee?.getTwoThirdsThreshold() ?? 0)
  const committeeRoute = $derived(`/client/${conferenceId}/committee/${committeeId}`)
  const cloudIdentity = $derived(
    cloudSession.session?.result.conferenceId === conferenceId &&
      cloudSession.session?.result.identity.committeeId === committeeId
      ? cloudSession.session.result.identity
      : null
  )
  const isCloudSession = $derived(cloudIdentity !== null)
  const canViewBattle = $derived(
    isCloudSession && cloudSession.session?.result.committeeType === 'ipc'
  )
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
  let cloudTimelineError = $state('')
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
      cloudTimelineError = error instanceof Error ? error.message : '刷新时间线失败'
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
    const interval = window.setInterval(() => void refreshCloudTimeline(token), 5000)
    return () => {
      window.clearInterval(interval)
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
      ? (cloudProjection?.conference.name ?? activeConference?.name)
      : activeConference?.name
  )
  const displayCommitteeName = $derived(
    cloudIdentity
      ? (cloudProjection?.committee.name ?? activeCommittee?.name)
      : activeCommittee?.name
  )

  $effect(() => {
    void cloudSession.ensureChairProjection(conferenceId, committeeId)
  })

  function goTo(path: string): void {
    // @ts-expect-error resolve requires a literal route type for dynamic paths.
    goto(resolve(path))
  }

  function openModsSettings(): void {
    activeSettingsSection.set('mods')
    settingsDialogOpen.set(true)
  }
</script>

<GlobalSidebar>
  {#snippet sidebar()}
    <Sidebar.Header>
      <BrandSwitcher conferenceName={displayConferenceName} committeeName={displayCommitteeName} />
    </Sidebar.Header>

    <Sidebar.Content>
      {#if inCommittee && (isCloudSession || (activeConference && activeCommittee))}
        <Sidebar.Menu class="p-3">
          <Sidebar.MenuItem>
            <Sidebar.MenuButton onclick={() => goto(resolve('/conference'))}>
              <ArrowLeft />
              <span>返回首页</span>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>

          <Sidebar.Separator class="my-1" />

          {#if isChair}
            <Sidebar.MenuItem>
              <Sidebar.MenuButton
                isActive={$page.url.pathname.startsWith(`${committeeRoute}/chair`) &&
                  !$page.url.pathname.startsWith(`${committeeRoute}/chair/participants`)}
                onclick={() => goTo(`${committeeRoute}/chair`)}
              >
                <Users />
                <span>主席</span>
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
                <span>代表管理</span>
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
          {/if}

          {#if canViewDirectives || canViewFiles || canViewSituation || canViewNews || canViewBattle}
            <Sidebar.Separator class="my-1" />
            <Sidebar.MenuItem>
              {#if canViewDirectives}
                <Sidebar.MenuButton
                  isActive={$page.url.pathname === `${committeeRoute}/directives`}
                  onclick={() => goTo(`${committeeRoute}/directives`)}
                >
                  <ScrollText />
                  <span>指令</span>
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
                  <span>文件</span>
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
                  <span>局势</span>
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
                  <span>新闻</span>
                </Sidebar.MenuButton>
              {/if}
            </Sidebar.MenuItem>
            {#if canViewBattle}
              <Sidebar.MenuItem>
                <Sidebar.MenuButton onclick={() => goTo(`/client/${conferenceId}/battle`)}>
                  <Swords />
                  <span>军事推演</span>
                </Sidebar.MenuButton>
              </Sidebar.MenuItem>
            {/if}
          {/if}

          {#if canControlConference}
            <!-- 代表团列表 -->
            <div class="flex flex-1 flex-col">
              {#if cloudSession.chairError}
                <p class="px-5 pb-3 text-xs text-destructive">{cloudSession.chairError}</p>
              {:else if cloudSession.loadingChairProjection}
                <p class="px-5 pb-3 text-xs text-muted-foreground">正在加载席位信息...</p>
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
              <span>首页</span>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>

          <Sidebar.MenuItem>
            <Sidebar.MenuButton onclick={() => createConferenceDialogOpen.set(true)}>
              <Plus />
              <span>创建大会</span>
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
              暂无最近大会
            </div>
          {/if}
        </Sidebar.Menu>
      {/if}
    </Sidebar.Content>
  {/snippet}

  {#snippet toolbar()}
    <Sidebar.Trigger class="-ms-1" />

    <div class="flex min-w-0 flex-1 items-center gap-6">
      {#if cloudIdentity}
        <div class="flex min-w-0 flex-col leading-tight">
          <span class="truncate text-xs font-medium">{cloudIdentity.displayName}</span>
          <span class="truncate text-[10px] text-muted-foreground">
            {cloudIdentity.roleName}
          </span>
        </div>
      {/if}

      {#if canControlConference}
        <div class="hidden items-center gap-6 sm:flex">
          <div class="flex flex-col leading-tight">
            <span class="text-[10px] text-muted-foreground">简单多数</span>
            <span class="text-xs font-semibold">{simpleMajority}</span>
          </div>
          <div class="flex flex-col leading-tight">
            <span class="text-[10px] text-muted-foreground">2/3 多数</span>
            <span class="text-xs font-semibold">{twoThirds}</span>
          </div>
        </div>
      {/if}
    </div>

    <div class="drag-region h-full flex-1"></div>

    {#if !isCloudSession || canViewCloudTimeline}
      <div
        class="pointer-events-none absolute inset-x-0 z-10 flex h-full items-center justify-center gap-1.5"
      >
        <div class="no-drag pointer-events-auto min-w-0 max-w-[calc(100%_-_10rem)]">
          <DynamicIsland
            cloudMode={isCloudSession}
            {cloudTimeline}
            cloudTimezone={cloudTimelineTimezone}
            {cloudTimelineReceivedAt}
          />
        </div>
        {#if canViewCloudTimeline}
          <Button
            variant="ghost"
            size="icon-xs"
            class={`no-drag pointer-events-auto text-muted-foreground hover:text-foreground ${cloudTimelineError ? 'text-destructive' : ''}`}
            disabled={cloudTimelineLoading}
            onclick={() => void refreshCloudTimeline(cloudSession.session?.result.token ?? '')}
            title={cloudTimelineError || '刷新时间线'}
            aria-label="刷新时间线"
          >
            <RefreshCw class={cloudTimelineLoading ? 'animate-spin' : ''} />
          </Button>
        {/if}
      </div>
    {/if}

    <Button
      variant="ghost"
      size="sm"
      class="no-drag px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      onclick={() => (displayOnlyDialogOpen = true)}
      title="显示窗口"
    >
      <Monitor />
    </Button>

    {#if electronEnvironment && (!isCloudSession || canControlConference)}
      <Button
        variant="ghost"
        size="sm"
        class="no-drag px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        onclick={openModsSettings}
        title="插件"
      >
        <Puzzle />
      </Button>
    {/if}
  {/snippet}

  {#if isCloudSession && fileNotifications.latest}
    <div
      class="mx-6 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/25 bg-primary/5 px-4 py-2 text-sm"
    >
      <span>
        {fileNotifications.latest.kind === 'file.submitted'
          ? '有新的待审文件'
          : fileNotifications.latest.kind === 'file.published'
            ? '有文件已通过审核'
            : fileNotifications.latest.kind === 'file.rejected'
              ? '有文件被打回，请查看原因'
              : '有新的文件可视范围申请'}
      </span>
      <div class="flex gap-2">
        <Button variant="outline" size="sm" onclick={() => goTo(`${committeeRoute}/files`)}>
          查看文件
        </Button>
        <Button variant="ghost" size="sm" onclick={() => fileNotifications.dismiss()}>关闭</Button>
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
</style>
