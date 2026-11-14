<script lang="ts">
  import '$units' // 初始化 ModRegistry 基础数据
  import JoinConferenceDialog from '$lib/components/conference/join-conference-dialog.svelte'
  import TimerDialog from '$lib/components/conference/timer/timer-dialog.svelte'
  import { timerDialogOpen } from '$lib/classes/stores/conference/timer-store'
  import { dbGetAllPlugins } from '$lib/classes/services/plugin/plugin-db'
  import { injectToRegistry } from '$lib/classes/services/plugin/plugin-registry'
  import { markPluginsReady } from '$lib/classes/services/plugin/mod-registry.svelte'
  import AppToolbar from '$lib/components/app-sidebar/app-toolbar.svelte'
  import DisplayOnlyDialog from '$lib/components/conference/display-only-dialog.svelte'

  import { joinConferenceDialogOpen } from '$lib/classes/stores/app/global-ui-store'
  import { isElectron } from '$lib/classes/utils/runtime'
  import TitleBar from '$lib/components/app-sidebar/title-bar.svelte'
  import StatusBar from '$lib/components/app-sidebar/status-bar.svelte'
  import { ScrollArea } from '$lib/components/ui/scroll-area'
  import CloudPlatformOverlayGuard from '$lib/components/app-sidebar/cloud-platform-overlay-guard.svelte'

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
</script>

<TimerDialog bind:open={$timerDialogOpen} />
<JoinConferenceDialog bind:open={$joinConferenceDialogOpen} />
<CloudPlatformOverlayGuard />

<div class="flex h-svh flex-col overflow-hidden">
  <TitleBar class="app-toolbar-header">
    <AppToolbar onOpenDisplay={() => (displayOnlyDialogOpen = true)} />
  </TitleBar>

  <main class="app-page-scroll flex min-h-0 flex-1 flex-col">
    <ScrollArea class="min-h-0 flex-1">
      {@render children()}
    </ScrollArea>
  </main>
  <StatusBar />
  <DisplayOnlyDialog bind:open={displayOnlyDialogOpen} />
</div>

<style>
  * {
    margin: 0;
  }

  :global(.app-toolbar-header) {
    padding-inline-start: var(--app-page-padding);
  }
</style>
