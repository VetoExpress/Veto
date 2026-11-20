<script lang="ts">
  import { Maximize, Minimize } from '@lucide/svelte'
  import favicon from '$lib/assets/favicon.png'
  import { toggleDisplayFullscreen } from '$lib/classes/clients/display-window'
  import WindowControls from '$lib/components/app-sidebar/window-controls.svelte'
  import { Button } from '$lib/components/ui/button'
  import { t } from '$lib/i18n'

  let { title, isFullScreen }: { title: string; isFullScreen: boolean } = $props()

  const fullscreenLabel = $derived(
    isFullScreen ? t('components_display_exit_fullscreen') : t('components_display_enter_fullscreen')
  )
</script>

<div class="display-title-bar-trigger no-drag fixed inset-x-0 top-0 z-50 h-10">
  <header
    class="display-title-bar flex h-full items-center justify-between gap-4 border-b border-white/10 bg-[#0a0e14] pl-3 text-sm text-white/80"
  >
    <div class="flex min-w-0 items-center gap-2">
      <img src={favicon} alt="" class="size-5 shrink-0" draggable={false} />
      <span class="truncate">{title}</span>
    </div>

    <div class="flex h-full shrink-0 items-center">
      <Button
        class="h-full w-11"
        variant="ghost"
        size="icon"
        onclick={toggleDisplayFullscreen}
        title={fullscreenLabel}
        aria-label={fullscreenLabel}
      >
        {#if isFullScreen}
          <Minimize data-icon="inline-start" />
        {:else}
          <Maximize data-icon="inline-start" />
        {/if}
      </Button>
      <WindowControls />
    </div>
  </header>
</div>

<style>
  .display-title-bar {
    opacity: 0;
    pointer-events: none;
  }

  .display-title-bar-trigger:hover .display-title-bar,
  .display-title-bar-trigger:has(:focus-visible) .display-title-bar {
    opacity: 1;
    pointer-events: auto;
  }

  @media (prefers-reduced-motion: no-preference) {
    .display-title-bar {
      transition: opacity 150ms ease;
    }
  }

  .display-title-bar :global(button:not(:hover)) {
    color: rgb(255 255 255 / 0.7);
  }

  .display-title-bar :global(button:not(.close-btn):hover) {
    background-color: rgb(255 255 255 / 0.1);
    color: white;
  }
</style>
