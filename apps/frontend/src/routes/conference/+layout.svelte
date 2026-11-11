<script lang="ts">
  import { t } from '$lib/i18n'
  import { onMount } from 'svelte'
  import '$units' // 初始化 ModRegistry 基础数据
  import JoinConferenceDialog from '$lib/components/conference/join-conference-dialog.svelte'
  import TimerDialog from '$lib/components/conference/timer/timer-dialog.svelte'
  import { timerDialogOpen } from '$lib/classes/stores/conference/timer-store'
  import { dbGetAllPlugins } from '$lib/classes/services/plugin/plugin-db'
  import { injectToRegistry } from '$lib/classes/services/plugin/plugin-registry'
  import { markPluginsReady } from '$lib/classes/services/plugin/mod-registry.svelte'
  import { Button } from '$lib/components/ui/button'
  import {
    ArrowLeft,
    FileText,
    Globe,
    House,
    LogIn,
    Monitor,
    Newspaper,
    Plus,
    Puzzle,
    Radio,
    Users
  } from '@lucide/svelte'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/stores'
  import BrandSwitcher from '$lib/components/app-sidebar/brand-switcher.svelte'
  import DisplayOnlyDialog from '$lib/components/conference/display-only-dialog.svelte'
  import GlobalSidebar from '$lib/components/global-sidebar.svelte'
  import * as Sidebar from '$lib/components/ui/sidebar'

  import { navigateToConference, navigateToCommittee } from '$lib/utils'
  import { conferences } from '$lib/classes/stores/conference/conference-store'
  import {
    activeSettingsSection,
    createConferenceDialogOpen,
    joinConferenceDialogOpen,
    settingsDialogOpen
  } from '$lib/classes/stores/app/global-ui-store'
  import { isElectron } from '$lib/classes/utils/runtime'

  let { children } = $props()

  // 桌面端恢复用户插件；Web 端不初始化或读取任何插件存储。
  if (typeof window !== 'undefined') {
    const pluginsInitialization = isElectron()
      ? dbGetAllPlugins().then((plugins) => {
          for (const plugin of plugins) {
            injectToRegistry(plugin)
          }
          markPluginsReady()
        })
      : Promise.resolve().then(markPluginsReady)

    Promise.all([
      pluginsInitialization,
      import('$lib/classes/stores/conference/conference-store').then((m) => m.conferencesReady),
      import('$lib/classes/stores/battle/battle-store').then((m) => m.battlesReady),
      import('$lib/classes/stores/timeline-store').then((m) => m.timelinesReady)
    ])
  }

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

  function goTo(path: string): void {
    // @ts-expect-error resolve requires a literal route type for dynamic paths.
    goto(resolve(path))
  }

  function openModsSettings(): void {
    activeSettingsSection.set('mods')
    settingsDialogOpen.set(true)
  }
</script>

<TimerDialog bind:open={$timerDialogOpen} />
<JoinConferenceDialog bind:open={$joinConferenceDialogOpen} />

<div>
  <GlobalSidebar>
    {#snippet sidebar()}
      <Sidebar.Header>
        <BrandSwitcher />
      </Sidebar.Header>

      <Sidebar.Content>
        {#if inCommittee && activeConference && activeCommittee}
          <Sidebar.Menu class="p-3">
            <Sidebar.MenuItem>
              <Sidebar.MenuButton onclick={() => navigateToConference(activeConference.id)}>
                <ArrowLeft />
                <span>{t('procedure_back_to_conference')}</span>
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
            <Sidebar.MenuItem>
              <Sidebar.MenuButton
                isActive={$page.url.pathname ===
                  `/conference/${conferenceId}/committee/${committeeId}`}
                onclick={() => navigateToCommittee(activeConference.id, activeCommittee.id)}
              >
                <Users />
                <span>{t('procedure_committee_overview')}</span>
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>

            <Sidebar.Separator class="my-1" />

            <Sidebar.MenuItem>
              <Sidebar.MenuButton
                isActive={$page.url.pathname.includes('/directives')}
                onclick={() =>
                  goTo(`/conference/${conferenceId}/committee/${committeeId}/directives`)}
              >
                <Radio />
                <span>{t('procedure_directives')}</span>
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
            <Sidebar.MenuItem>
              <Sidebar.MenuButton
                isActive={$page.url.pathname.includes('/news')}
                onclick={() => goTo(`/conference/${conferenceId}/committee/${committeeId}/news`)}
              >
                <Newspaper />
                <span>{t('procedure_news')}</span>
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
            <Sidebar.MenuItem>
              <Sidebar.MenuButton
                isActive={$page.url.pathname.includes('/situation')}
                onclick={() =>
                  goTo(`/conference/${conferenceId}/committee/${committeeId}/situation`)}
              >
                <Globe />
                <span>{t('procedure_situation_updates')}</span>
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
            <Sidebar.MenuItem>
              <Sidebar.MenuButton
                isActive={$page.url.pathname.includes('/files')}
                onclick={() => goTo(`/conference/${conferenceId}/committee/${committeeId}/files`)}
              >
                <FileText />
                <span>{t('procedure_files')}</span>
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
          </Sidebar.Menu>
        {:else}
          <Sidebar.Menu class="p-3">
            <Sidebar.MenuItem>
              <Sidebar.MenuButton onclick={() => goTo('/conference')}>
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

            <Sidebar.MenuItem>
              <Sidebar.MenuButton onclick={() => joinConferenceDialogOpen.set(true)}>
                <LogIn />
                <span>{t('procedure_join_conference')}</span>
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
      <Sidebar.Trigger class="-ms-1" />
      <div class="drag-region h-full flex-1"></div>

      <Button
        variant="ghost"
        size="sm"
        class="no-drag px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        onclick={() => (displayOnlyDialogOpen = true)}
        title={t('procedure_display_window')}
      >
        <Monitor />
      </Button>

      {#if electronEnvironment}
        <Button
          variant="ghost"
          size="sm"
          class="no-drag px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          onclick={openModsSettings}
          title={t('procedure_plugins')}
        >
          <Puzzle />
        </Button>
      {/if}
    {/snippet}

    {@render children()}
  </GlobalSidebar>

  <DisplayOnlyDialog bind:open={displayOnlyDialogOpen} />
</div>

<style>
  * {
    margin: 0;
  }

  .drag-region {
    -webkit-app-region: drag;
  }
</style>
