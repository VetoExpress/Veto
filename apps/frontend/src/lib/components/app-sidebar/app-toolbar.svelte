<script lang="ts">
  import { onMount } from 'svelte'
  import { Cloud, LayoutDashboard, Monitor, Puzzle, User, Workflow, Settings } from '@lucide/svelte'
  import { t } from '$lib/i18n'
  import * as Avatar from '$lib/components/ui/avatar'
  import { Button } from '$lib/components/ui/button'
  import { accountStore } from '$lib/classes/stores/app/account-store'
  import {
    activeSettingsSection,
    settingsDialogOpen
  } from '$lib/classes/stores/app/global-ui-store'
  import { isElectron } from '$lib/classes/utils/runtime'
  import favicon from '$lib/assets/favicon.png'

  let { onOpenDisplay }: { onOpenDisplay: () => void } = $props()

  let electronEnvironment = $state(false)

  onMount(() => {
    electronEnvironment = isElectron()
  })

  function openModsSettings(): void {
    activeSettingsSection.set('mods')
    settingsDialogOpen.set(true)
  }
</script>

<div class="app-nav flex h-full min-w-0 flex-1 items-center">
  <div class="flex min-w-0 items-center gap-7">
    <div class="flex shrink-0 items-center gap-2.5">
      <div class="brand-mark flex size-8 items-center justify-center rounded-[10px] text-white">
        <img src={favicon} class="size-8 rounded-md" alt="" />
      </div>
      <div class="leading-none">
        <p class="text-[17px] font-bold tracking-tight text-slate-900 dark:text-slate-100">Veto</p>
        <p class="mt-1 text-[9px] font-medium uppercase tracking-[0.18em] text-slate-400">
          Conference OS
        </p>
      </div>
    </div>
    <nav class="hidden items-center gap-1 md:flex" aria-label={t('procedure_workspace_navigation')}>
      <button type="button" class="nav-tab nav-tab-active" aria-current="page">
        <LayoutDashboard class="size-4" />{t('procedure_workspace')}
      </button>
      <button type="button" class="nav-tab">
        <Workflow class="size-4" />{t('procedure_tools')}
      </button>
      <button type="button" class="nav-tab">
        <Puzzle class="size-4" />{t('procedure_plugins')}
      </button>
    </nav>
  </div>

  <div class="drag-region h-full min-w-0 flex-1"></div>

  <div class="flex shrink-0 items-center gap-3 text-slate-400">
    <div class="hidden items-center gap-2 text-[11px] lg:flex">
      <Cloud class="size-4" />{t('procedure_all_changes_saved')}
    </div>
    <div class="flex items-center gap-2">
      <Button
        class="size-8"
        variant="ghost"
        size="icon"
        onclick={() => settingsDialogOpen.set(true)}
      >
        <Avatar.Root
          class="flex size-8 items-center cursor-pointer justify-center rounded-full bg-indigo-100 text-[11px] font-bold text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300"
        >
          {#if $accountStore.user?.avatar}
            <Avatar.Image src={$accountStore.user.avatar} alt={$accountStore.user.name} />
          {/if}
          <Avatar.Fallback>
            <User />
          </Avatar.Fallback>
        </Avatar.Root>
      </Button>
      {#if $accountStore.user?.name}
        <span class="max-w-32 truncate text-xs font-medium text-slate-600 dark:text-slate-300">
          {$accountStore.user.name}
        </span>
      {/if}
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
    background: color-mix(in oklch, white 92%, transparent);
  }
  :global(.dark) .app-nav {
    background: color-mix(in oklch, #172033 88%, transparent);
  }
  .brand-mark {
    background: #5d6bff;
    box-shadow: 0 7px 16px #5d6bff30;
  }
  .nav-tab {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    border: 0;
    border-radius: 0.6rem;
    padding: 0.58rem 0.8rem;
    background: transparent;
    color: #68758a;
    cursor: pointer;
    font: inherit;
    font-size: 0.75rem;
    font-weight: 500;
    transition:
      background-color 150ms ease,
      color 150ms ease;
  }
  .nav-tab:hover {
    background: #f4f5fb;
    color: #4b59d5;
  }
  .nav-tab:focus-visible {
    outline: 2px solid #5d6bff;
    outline-offset: 2px;
  }
  .nav-tab-active {
    background: #eef0ff;
    color: #4b59d5;
  }
  :global(.dark) .nav-tab {
    color: #a8b4c9;
  }
  :global(.dark) .nav-tab:hover {
    background: #202844;
    color: #d4d8ff;
  }
  :global(.dark) .nav-tab-active {
    background: #252e5d;
    color: #b9c1ff;
  }
</style>
