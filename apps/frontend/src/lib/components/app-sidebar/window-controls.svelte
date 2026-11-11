<script lang="ts">
  import { t } from '$lib/i18n'
  import { Minus, Square, X } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button'
  import { isElectron } from '$lib/classes/utils/runtime'
  import { IPC_WINDOW_CHANNELS } from '$lib/classes/const'

  function minimize(): void {
    window.electron.ipcRenderer.send(IPC_WINDOW_CHANNELS.minimize)
  }
  function maximize(): void {
    window.electron.ipcRenderer.send(IPC_WINDOW_CHANNELS.maximize)
  }
  function close(): void {
    window.electron.ipcRenderer.send(IPC_WINDOW_CHANNELS.close)
  }
</script>

<div class="flex shrink-0 items-center h-full">
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
