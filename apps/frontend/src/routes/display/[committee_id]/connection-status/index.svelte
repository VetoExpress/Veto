<script lang="ts">
  import { t } from '$lib/i18n'
  import { Wifi, WifiOff, LoaderCircle } from '@lucide/svelte'
  import type { ConnectionStatus } from '$lib/classes/clients/conference-display-client'

  let { status }: { status: ConnectionStatus } = $props()
</script>

<div class="flex h-full w-full items-center justify-center">
  <div class="flex flex-col items-center gap-6 text-white/10">
    {#if status === 'connecting'}
      <LoaderCircle size={64} class="animate-spin text-white/10" />
      <div class="text-7xl font-light tracking-[0.06em]">{t('components_connecting')}</div>
      <div class="text-lg tracking-wider text-white/5">CONNECTING</div>
    {:else if status === 'disconnected'}
      <WifiOff size={64} />
      <div class="text-7xl font-light tracking-[0.06em]">{t('components_disconnected')}</div>
      <div class="text-lg tracking-wider text-white/5">RECONNECTING</div>
      <div class="text-base tracking-wider text-white/5">{t('components_reconnecting')}</div>
    {:else}
      <!-- connected but no data yet -->
      <Wifi size={64} />
      <div class="text-7xl font-light tracking-[0.06em]">{t('components_waiting_data')}</div>
      <div class="text-lg tracking-wider text-white/5">AWAITING DATA</div>
    {/if}
  </div>
</div>
