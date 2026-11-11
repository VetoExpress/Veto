<script>
  import { VETO_NAME } from '$lib/classes/const'
  import { initializeLocale, getLocale } from '$lib/i18n'
  import { mods } from '$lib/classes/services/plugin/mod-registry.svelte'
  import { onMount } from 'svelte'
  import { scheduleWebLaunchTelemetry } from '$lib/classes/services/web-telemetry'
  import { conferenceSync } from '$lib/classes/stores/conference/conference-sync-store'
  import { ModeWatcher } from 'mode-watcher'
  import { createConferenceDialogOpen } from '$lib/classes/stores/app/global-ui-store'
  import MyAlertDialog from '$lib/components/dialog/my-alert-dialog.svelte'
  import SettingsDialog from '$lib/components/settings/settings-dialog.svelte'
  import CreateConferenceDialog from '$lib/components/conference/create/create-conference-dialog.svelte'

  import logo from '$lib/assets/logo.svg'
  import '../app.css'
  import '../css/components.css'

  let { children } = $props()

  $effect(() => {
    mods.setLocale(getLocale())
  })

  onMount(() => {
    const stopLocale = initializeLocale()
    scheduleWebLaunchTelemetry(__APP_VERSION__)
    const stopSync = conferenceSync.start()
    return () => {
      stopLocale()
      stopSync()
    }
  })
</script>

<svelte:head>
  <title>{VETO_NAME}</title>
  <meta name="title" content={VETO_NAME} />
  <link rel="icon" type="image/x-icon" href={logo} />
</svelte:head>

<ModeWatcher />
<MyAlertDialog />
<SettingsDialog />
<CreateConferenceDialog bind:open={$createConferenceDialogOpen} />
{@render children()}
