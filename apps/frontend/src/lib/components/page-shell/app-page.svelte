<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements'
  import { cn } from '$lib/classes/utils'

  let { class: className, children, ...restProps }: HTMLAttributes<HTMLElement> = $props()
</script>

<section class={cn('app-page', className)} {...restProps}>
  {@render children?.()}
</section>
