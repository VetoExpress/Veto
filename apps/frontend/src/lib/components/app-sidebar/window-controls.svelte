<script lang="ts">
  import { t } from '$lib/i18n'
  import { Minus, Settings, Square, X } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button'
  import { settingsDialogOpen } from '$lib/classes/stores/app/global-ui-store'
  import { isElectron } from '$lib/classes/utils/runtime'
  import { IPC_WINDOW_CHANNELS } from '$lib/classes/const'

  let { showSettings = true }: { showSettings?: boolean } = $props()

  function minimize() {
    window.electron.ipcRenderer.send(IPC_WINDOW_CHANNELS.minimize)
  }
  function maximize() {
    window.electron.ipcRenderer.send(IPC_WINDOW_CHANNELS.maximize)
  }
  function close() {
    window.electron.ipcRenderer.send(IPC_WINDOW_CHANNELS.close)
  }
</script>

<div class="flex shrink-0 items-center h-full">
  {#if showSettings}
    <Button
      variant="ghost"
      class="flex h-full items-center justify-center px-3 text-muted-foreground hover:bg-accent hover:text-foreground no-drag"
      onclick={() => settingsDialogOpen.set(true)}
      title={t('settings_title')}
    >
      <Settings size={14} />
    </Button>

    <div class="mx-0.5 h-5 w-px bg-border/40"></div>
  {/if}
  {#if isElectron()}
    <Button
      class="no-drag flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"
      onclick={minimize}
      variant="ghost"
      title={t('settings_minimize')}
    >
      <Minus size={14} />
    </Button>

    <Button
      class="no-drag flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"
      onclick={maximize}
      variant="ghost"
      title={t('settings_maximize')}
    >
      <Square size={11} />
    </Button>

    <Button
      class="no-drag close-btn flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-red-500 hover:text-white"
      onclick={close}
      variant="ghost"
      title={t('settings_close')}
    >
      <X size={14} />
    </Button>
  {/if}
</div>
