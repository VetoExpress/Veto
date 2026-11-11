<script lang="ts">
  import type { ComponentProps, Snippet } from 'svelte'
  import * as Sidebar from '$lib/components/ui/sidebar/index.js'
  import WindowControls from './app-sidebar/window-controls.svelte'
  import { isElectron } from '$lib/classes/utils/runtime'

  let {
    class: className = '',
    collapsible = 'icon',
    showSidebar = true,
    sidebar,
    toolbar,
    children,
    ...restProps
  }: {
    class?: string
    collapsible?: 'offcanvas' | 'icon' | 'none'
    showSidebar?: boolean
    sidebar?: Snippet
    toolbar?: Snippet
    children: Snippet
  } & Omit<ComponentProps<typeof Sidebar.Root>, 'children' | 'class'> = $props()
</script>

<Sidebar.Provider class="h-svh overflow-hidden">
  {#if showSidebar}
    <Sidebar.Root variant="inset" class={className} {collapsible} {...restProps}>
      {@render sidebar?.()}
      <Sidebar.Rail />
    </Sidebar.Root>
  {/if}

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
