<script lang="ts">
  import type { ComponentProps, Snippet } from 'svelte'
  import * as Sidebar from '$lib/components/ui/sidebar/index.js'
  import WindowControls from './app-sidebar/window-controls.svelte'
  import TitleBar from './app-sidebar/title-bar.svelte'
  import { SIDEBAR_WIDTH } from './ui/sidebar/constants'

  let {
    class: className = '',
    collapsible = 'icon',
    showSidebar = true,
    fullWidth = false,
    heading,
    footer,
    sidebar,
    toolbar,
    children,
    ...restProps
  }: {
    class?: string
    collapsible?: 'offcanvas' | 'icon' | 'none'
    showSidebar?: boolean
    fullWidth?: boolean
    heading?: Snippet
    footer?: Snippet
    sidebar?: Snippet
    toolbar?: Snippet
    children: Snippet
  } & Omit<ComponentProps<typeof Sidebar.Root>, 'children' | 'class'> = $props()
</script>

{#snippet navigation()}
  {#if showSidebar}
    <Sidebar.Root
      variant="inset"
      class={className}
      collapsible={fullWidth ? 'none' : collapsible}
      {...restProps}
    >
      {@render sidebar?.()}
      {#if !fullWidth && collapsible !== 'none'}<Sidebar.Rail />{/if}
    </Sidebar.Root>
  {/if}
{/snippet}

{#if fullWidth}
  <div
    class="client-shell flex h-svh flex-col overflow-hidden bg-sidebar"
    style={`--sidebar-width: ${SIDEBAR_WIDTH}`}
  >
    <TitleBar class="gap-0 border-b">
      <div class="client-heading flex min-w-0 items-center px-5">
        {@render heading?.()}
      </div>
      <div class="client-toolbar flex h-full min-w-0 flex-1 items-center gap-3">
        {@render toolbar?.()}
      </div>
    </TitleBar>

    <div class="client-body relative flex min-h-0 flex-1 overflow-hidden">
      {@render navigation()}
      <Sidebar.Inset class="mb-2 mr-2 min-h-0 min-w-0 overflow-hidden rounded-xl shadow-sm">
        <div class="flex min-h-0 flex-1 flex-col overflow-auto">
          {@render children()}
        </div>
      </Sidebar.Inset>
    </div>
    {@render footer?.()}
  </div>
{:else}
  <Sidebar.Provider class="h-svh overflow-hidden">
    {@render navigation()}

    <Sidebar.Inset
      class={showSidebar
        ? 'min-h-0 overflow-hidden'
        : 'm-2 min-h-0 overflow-hidden rounded-xl shadow-sm'}
    >
      <header class="relative flex h-9 shrink-0 items-center gap-2 pl-4">
        {@render toolbar?.()}

        <WindowControls />
      </header>

      <div class="flex min-h-0 flex-1 flex-col">
        {@render children()}
      </div>
    </Sidebar.Inset>
  </Sidebar.Provider>
{/if}

<style>
  .client-heading {
    width: var(--sidebar-width);
    flex-shrink: 0;
  }

  .client-body > :global(:first-child) {
    flex-shrink: 0;
  }

  @media (max-width: 767px) {
    .client-shell {
      --sidebar-width: 8rem !important;
    }

    .client-heading {
      width: min(45%, 16rem);
      padding-inline: 0.5rem;
    }
  }
</style>
