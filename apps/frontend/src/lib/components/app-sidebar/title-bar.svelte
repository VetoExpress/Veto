<script lang="ts">
  import type { Snippet } from 'svelte'
  import { cn } from '$lib/classes/utils'
  import WindowControls from './window-controls.svelte'

  let { children, class: className }: { children: Snippet; class?: string } = $props()
</script>

<header
  data-slot="app-titlebar"
  class={cn('relative flex h-12 shrink-0 items-center gap-2 bg-background', className)}
>
  {@render children()}
  <WindowControls />
</header>
