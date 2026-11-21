<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { t } from '$lib/i18n'
  import * as AlertDialog from '$lib/components/ui/alert-dialog'

  let availableVersion = $state<string | null>(null)
  let availableOpen = $state(false)
  let downloading = $state(false)
  let dismissedVersion = $state<string | null>(null)
  let startupInstallVersion = $state<string | null>(null)
  let installCountdown = $state(3)
  let installTimer: ReturnType<typeof setInterval> | null = null
  let stopEventListeners: Array<() => void> = []

  function extractVersion(data: unknown): string | null {
    if (typeof data !== 'object' || data === null || !('version' in data)) return null
    const version = data.version
    return typeof version === 'string' && version.length > 0 ? version : null
  }

  function showAvailableUpdate(data: unknown): void {
    const version = extractVersion(data)
    if (!version || version === dismissedVersion || startupInstallVersion) return

    availableVersion = version
    availableOpen = true
  }

  function startStartupInstall(version: string | null): void {
    if (!version || startupInstallVersion) return

    availableOpen = false
    startupInstallVersion = version
    installCountdown = 3
    installTimer = setInterval(() => {
      if (installCountdown <= 1) {
        if (installTimer) clearInterval(installTimer)
        installTimer = null
        void window.veto.updater.quitAndInstall()
        return
      }
      installCountdown -= 1
    }, 1000)
  }

  function cancelUpdate(): void {
    dismissedVersion = availableVersion
    availableOpen = false
  }

  async function installNow(): Promise<void> {
    if (downloading) return

    downloading = true
    try {
      const result = await window.veto.updater.download()
      if (result.success) {
        availableOpen = false
        await window.veto.updater.quitAndInstall()
        return
      }
    } catch {
      // Keep the prompt available so the next automatic check can retry silently.
    }

    downloading = false
  }

  onMount(() => {
    if (!window.veto?.events || !window.veto.updater) return

    stopEventListeners = [
      window.veto.events.on('updater:update-available', showAvailableUpdate),
      window.veto.events.on('updater:installing-on-startup', (data) => {
        startStartupInstall(extractVersion(data))
      })
    ]

    void window.veto.updater.getStartupStatus().then((status) => {
      if (status.installing) {
        startStartupInstall(status.version)
      } else if (status.availableVersion) {
        showAvailableUpdate({ version: status.availableVersion })
      }
    })
  })

  onDestroy(() => {
    stopEventListeners.forEach((stop) => stop())
    if (installTimer) clearInterval(installTimer)
  })
</script>

<AlertDialog.Root
  open={availableOpen}
  onOpenChange={(open) => {
    if (!open) cancelUpdate()
  }}
>
  <AlertDialog.Content class="z-[1000]">
    <AlertDialog.Header>
      <AlertDialog.Title>{t('settings_update_available_title')}</AlertDialog.Title>
      <AlertDialog.Description>
        {t('settings_update_available_description', { version: availableVersion ?? '' })}
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel onclick={cancelUpdate}>{t('settings_update_cancel')}</AlertDialog.Cancel>
      <AlertDialog.Action disabled={downloading} onclick={installNow}>
        {downloading ? t('settings_update_preparing') : t('settings_update_now')}
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root open={startupInstallVersion !== null} onOpenChange={() => {}}>
  <AlertDialog.Content class="z-[1000]">
    <AlertDialog.Header>
      <AlertDialog.Title>{t('settings_update_installing_title')}</AlertDialog.Title>
      <AlertDialog.Description>
        {t('settings_update_installing_description', {
          version: startupInstallVersion ?? '',
          seconds: installCountdown
        })}
      </AlertDialog.Description>
    </AlertDialog.Header>
  </AlertDialog.Content>
</AlertDialog.Root>
