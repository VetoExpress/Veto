<script lang="ts">
  import { onMount } from 'svelte'
  import { ArrowLeft, ArrowRight, Cloud, LayoutDashboard, Monitor, Puzzle, User, Workflow, Settings } from '@lucide/svelte'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/stores'
  import { t } from '$lib/i18n'
  import * as Avatar from '$lib/components/ui/avatar'
  import { Button } from '$lib/components/ui/button'
  import { accountStore } from '$lib/classes/stores/app/account-store'
  import { settingsDialogOpen } from '$lib/classes/stores/app/global-ui-store'
  import { isElectron } from '$lib/classes/utils/runtime'
  import favicon from '$lib/assets/favicon.png'
  import { cloudPlatformView } from '$lib/classes/stores/app/cloud-platform-view.svelte'

  let { onOpenDisplay }: { onOpenDisplay: () => void } = $props()

  let electronEnvironment = $state(false)

  onMount(() => {
    electronEnvironment = isElectron()
  })
</script>

<div class="app-nav flex h-full min-w-0 flex-1 items-center">
  <div class="flex min-w-0 items-center gap-7">
    <div class="flex shrink-0 items-center gap-2.5">
      <div class="leading-none">
        <p class="text-[17px] font-bold tracking-tight text-foreground">Veto</p>
        <p class="mt-1 text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Conference OS
        </p>
      </div>
    </div>
    <nav class="hidden items-center gap-1 md:flex" aria-label={t('procedure_workspace_navigation')}>
      <button
        type="button"
        class={`nav-tab${!$cloudPlatformView.open && $page.url.pathname === '/conference' ? ' nav-tab-active' : ''}`}
        aria-current={!$cloudPlatformView.open && $page.url.pathname === '/conference' ? 'page' : undefined}
        onclick={() => {
          cloudPlatformView.close()
          goto(resolve('/conference'))
        }}
      >
        <LayoutDashboard class="size-4" />{t('procedure_workspace')}
      </button>
      <button
        type="button"
        class={`nav-tab${$cloudPlatformView.open ? ' nav-tab-active' : ''}`}
        aria-current={$cloudPlatformView.open ? 'page' : undefined}
        onclick={() => cloudPlatformView.open()}
      >
        <Cloud class="size-4" />{t('settings_cloud_platform')}
      </button>
      {#if $cloudPlatformView.open}
        <span class="mx-1 h-5 w-px bg-border" aria-hidden="true"></span>
        <button
          type="button"
          class="nav-icon"
          aria-label={t('settings_platform_back')}
          title={t('settings_platform_back')}
          disabled={!$cloudPlatformView.canGoBack}
          onclick={() => cloudPlatformView.goBack()}
        >
          <ArrowLeft class="size-4" />
        </button>
        <button
          type="button"
          class="nav-icon"
          aria-label={t('settings_platform_forward')}
          title={t('settings_platform_forward')}
          disabled={!$cloudPlatformView.canGoForward}
          onclick={() => cloudPlatformView.goForward()}
        >
          <ArrowRight class="size-4" />
        </button>
      {/if}
      <button
        type="button"
        class={`nav-tab${!$cloudPlatformView.open && $page.url.pathname === '/conference/tools' ? ' nav-tab-active' : ''}`}
        aria-current={!$cloudPlatformView.open && $page.url.pathname === '/conference/tools' ? 'page' : undefined}
        onclick={() => {
          cloudPlatformView.close()
          goto(resolve('/conference/tools'))
        }}
      >
        <Workflow class="size-4" />{t('procedure_tools')}
      </button>
      <button
        type="button"
        class={`nav-tab${!$cloudPlatformView.open && $page.url.pathname === '/conference/plugins' ? ' nav-tab-active' : ''}`}
        aria-current={!$cloudPlatformView.open && $page.url.pathname === '/conference/plugins' ? 'page' : undefined}
        onclick={() => {
          cloudPlatformView.close()
          goto(resolve('/conference/plugins'))
        }}
      >
        <Puzzle class="size-4" />{t('procedure_plugins')}
      </button>
    </nav>
  </div>

  <div class="drag-region h-full min-w-0 flex-1"></div>

  <div class="flex shrink-0 items-center gap-3 text-muted-foreground">
    <div class="flex items-center gap-2">
      <Button
        class="size-8"
        variant="ghost"
        size="icon"
        onclick={() => settingsDialogOpen.set(true)}
      >
        <Avatar.Root
          class="flex size-8 items-center cursor-pointer justify-center rounded-full bg-muted text-[11px] font-bold text-foreground"
        >
          {#if $accountStore.user?.avatar}
            <Avatar.Image src={$accountStore.user.avatar} alt={$accountStore.user.name} />
          {/if}
          <Avatar.Fallback>
            <User />
          </Avatar.Fallback>
        </Avatar.Root>
        {#if $accountStore.user?.name}
          <span class="max-w-32 truncate text-xs font-medium text-foreground">
            {$accountStore.user.name}
          </span>
        {/if}
      </Button>
    </div>

    <Button
      variant="ghost"
      size="sm"
      class="no-drag px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      onclick={onOpenDisplay}
      title={t('procedure_display_window')}
    >
      <Monitor />
    </Button>

    <Button
      variant="ghost"
      class="flex h-full items-center justify-center px-3 text-muted-foreground hover:bg-accent hover:text-foreground no-drag"
      onclick={() => settingsDialogOpen.set(true)}
      title={t('settings_title')}
    >
      <Settings size={14} />
    </Button>
  </div>
</div>

<style>
  * {
    margin: 0;
  }

  .drag-region {
    -webkit-app-region: drag;
  }

  .app-nav {
    background: var(--background);
  }
  .nav-tab {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    border: 0;
    border-radius: 0.6rem;
    padding: 0.58rem 0.8rem;
    background: transparent;
    color: var(--muted-foreground);
    cursor: pointer;
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 500;
    transition:
      background-color 150ms ease,
      color 150ms ease;
  }
  .nav-tab:hover {
    background: var(--muted);
    color: var(--foreground);
  }
  .nav-tab:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
  .nav-tab-active {
    background: var(--muted);
    color: var(--foreground);
  }
  .nav-icon {
    display: inline-flex;
    width: 2rem;
    height: 2rem;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 0.5rem;
    background: transparent;
    color: var(--muted-foreground);
    cursor: pointer;
  }
  .nav-icon:hover:not(:disabled) {
    background: var(--muted);
    color: var(--foreground);
  }
  .nav-icon:disabled {
    cursor: default;
    opacity: 0.4;
  }
</style>
