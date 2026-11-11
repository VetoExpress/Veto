<script lang="ts">
  import { t } from '$lib/i18n'
  import PluginManager from '$lib/components/plugins/plugin-manager.svelte'
</script>

<svelte:head>
  <title>{t('procedure_plugins')} · Veto</title>
</svelte:head>

<PluginManager />
