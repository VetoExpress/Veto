<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import { cn } from '$lib/classes/utils'

  let {
    title,
    description,
    children,
    class: className,
    ...restProps
  }: Omit<HTMLAttributes<HTMLElement>, 'title'> & {
    title: string | Snippet
    description?: string
  } = $props()
</script>

<header class={cn('app-page-heading', className)} {...restProps}>
  <div class="app-page-heading-copy">
    <h1 class="app-page-title">
      {#if typeof title === 'string'}{title}{:else}{@render title()}{/if}
    </h1>
    {#if description}<p class="app-page-description">{description}</p>{/if}
  </div>
  {#if children}<div class="app-page-actions">{@render children()}</div>{/if}
</header>
